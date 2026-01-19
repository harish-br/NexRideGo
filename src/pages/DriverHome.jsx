import React, { useEffect, useState } from 'react';
import { APIProvider, Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { goOnline, goOffline, listenForRequests, acceptRide, rejectRide, unlockDriver, arriveAtPickup, startTrip, completeTrip } from '../services/driverService';
import RideRequestPopup from '../components/RideRequestPopup';
import DriverMenu from '../components/DriverMenu';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const API_KEY = 'AIzaSyDlpxJyvl6FFHQGVO3_i-FsTO_-L9GlLO8';

// Helper component for Directions
const Directions = ({ origin, destination }) => {
    const map = useMap();
    const routesLibrary = useMapsLibrary('routes');
    const [directionsService, setDirectionsService] = useState(null);
    const [directionsRenderer, setDirectionsRenderer] = useState(null);

    useEffect(() => {
        if (!routesLibrary || !map) return;
        setDirectionsService(new routesLibrary.DirectionsService());
        setDirectionsRenderer(new routesLibrary.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: '#0042DA', strokeWeight: 5 } }));
    }, [routesLibrary, map]);

    useEffect(() => {
        if (!directionsService || !directionsRenderer || !origin || !destination) return;

        const originVal = typeof origin === 'string' ? origin : origin.address || origin.name || origin;
        const destVal = typeof destination === 'string' ? destination : destination.address || destination.name || destination;

        if (!originVal || !destVal) return;

        directionsService.route({
            origin: originVal,
            destination: destVal,
            travelMode: 'DRIVING'
        }).then(response => {
            directionsRenderer.setDirections(response);
        }).catch(e => console.error("Directions request failed", e));

    }, [directionsService, directionsRenderer, origin, destination]);

    return null;
};

const DriverHome = () => {
    const [driverId, setDriverId] = useState(null);
    const [isOnline, setIsOnline] = useState(false);
    const [activeRequest, setActiveRequest] = useState(null);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [statusMessage, setStatusMessage] = useState("You're offline");
    const [location, setLocation] = useState({ lat: 11.3470, lng: 77.7197 });
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Capture App Start Time to ignore stale requests
    const appStartedAt = React.useRef(Date.now());

    // Derived Trip Status
    const isTripActive = !!currentTrip;

    // Determine bottom sheet state: 'idle' | 'searching' | 'on-trip'
    const getBottomSheetState = () => {
        if (isTripActive) return 'on-trip';
        if (isOnline) return 'searching';
        return 'idle';
    };

    const sheetState = getBottomSheetState();

    // Helper to get Directions props
    const getDirectionProps = () => {
        if (!currentTrip) return null;
        const status = currentTrip.status;

        if (status === 'DRIVER_ACCEPTED') {
            return { origin: location, destination: currentTrip.pickup };
        }
        if (status === 'ON_TRIP') {
            return { origin: currentTrip.pickup, destination: currentTrip.drop };
        }
        return null; // DRIVER_ARRIVED -> No route needed usually, or keep valid
    };

    const directionProps = getDirectionProps();

    // 1. Get Live Location
    useEffect(() => {
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const newLoc = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    setLocation(newLoc);
                },
                (error) => console.error("Location error:", error),
                { enableHighAccuracy: true }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, [isOnline, driverId]);


    // 2. Auth & Initialization
    useEffect(() => {
        const unsub = auth.onAuthStateChanged((user) => {
            if (user) {
                console.log("🔒 [Auth] User detected:", user.uid);
                setDriverId(user.uid);
            } else {
                console.log("🔒 [Auth] No user session found.");
            }
        });

        setStatusMessage("You're offline");
        return () => unsub();
    }, []);

    // 3. Listener for REQUESTS
    useEffect(() => {
        if (!driverId || isTripActive) return;

        const unsubscribe = listenForRequests(driverId, appStartedAt.current, (request) => {
            setActiveRequest(request);
        });
        return () => unsubscribe && unsubscribe();
    }, [driverId, isTripActive]);

    // 4. Listener for ACTIVE TRIP
    useEffect(() => {
        if (!currentTrip?.id) return;

        const tripRef = doc(db, "trips", currentTrip.id);
        const unsub = onSnapshot(tripRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const status = data.status;

                // Handle Terminal States
                if (['COMPLETED', 'CANCELLED_BY_USER', 'CANCELLED_BY_DRIVER', 'FAILED', 'CANCELLED'].includes(status)) {
                    await unlockDriver(driverId);
                    setCurrentTrip(null);
                    setIsOnline(true);
                    setStatusMessage(status === 'COMPLETED' ? "Trip Completed" : "Trip Cancelled");
                } else {
                    setCurrentTrip(prev => ({ ...prev, ...data }));
                }
            }
        });
        return () => unsub();
    }, [currentTrip?.id, driverId]);


    // Handlers
    const playSuccessSound = () => {
        const audio = new Audio("/sounds/success-221935.mp3");
        audio.play().catch(e => console.error("Audio play failed", e));
    };

    const handleGoOnline = async () => {
        setIsLoading(true);
        setStatusMessage("Going Online...");
        console.log("🖱️ 'GO' Clicked. Current Status: Offline. Triggering goOnline...");

        try {
            const result = await goOnline(driverId, location);
            if (result.success) {
                console.log("✨ goOnline Success. New ID:", result.id);
                setDriverId(result.id);
                setIsOnline(true);
                setStatusMessage("You're online");
                playSuccessSound();
            } else {
                console.error("❌ goOnline Failed Result:", result.error);
                setIsOnline(false);
                setStatusMessage(`Connection Failed: ${result.error}`);
            }
        } catch (err) {
            console.error("💥 Unexpected error in handleGoOnline:", err);
            setIsOnline(false);
            setStatusMessage("Critical Error. Check Console.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoOffline = async () => {
        if (!driverId) return;
        setIsLoading(true);
        setStatusMessage("Going Offline...");
        console.log("🖱️ 'STOP' Clicked. Triggering goOffline backend...");

        try {
            await goOffline(driverId);
            setIsOnline(false);
            setStatusMessage("You're offline");
            playSuccessSound();
        } catch (err) {
            console.error("❌ Failed to go offline:", err);
            setStatusMessage("Connect Error");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAvailability = () => {
        if (isLoading) {
            console.log("⏳ Already loading, ignoring click.");
            return;
        }
        console.log(`🔄 Toggling Availability. Current isOnline: ${isOnline}`);
        if (isOnline) handleGoOffline();
        else handleGoOnline();
    };

    const handleAccept = async (tripId) => {
        if (!activeRequest) return;
        try {
            await acceptRide(tripId, driverId);
            setCurrentTrip({
                id: tripId,
                ...activeRequest,
                status: 'DRIVER_ACCEPTED' // Optimistic update
            });
            setActiveRequest(null);
        } catch (error) {
            console.error(error);
        }
    };

    const handleReject = async (tripId) => {
        if (!activeRequest) return;
        try {
            await rejectRide(tripId, driverId);
            setActiveRequest(null);
        } catch (error) {
            console.error(error);
        }
    };

    const handleArrived = async () => {
        if (currentTrip) await arriveAtPickup(currentTrip.id);
    };

    const handleStartTrip = async () => {
        if (currentTrip) await startTrip(currentTrip.id);
    };

    const handleCompleteTrip = async () => {
        if (currentTrip) await completeTrip(currentTrip.id, driverId);
    };

    const getAddressName = (addr) => {
        if (!addr) return "Unknown";
        if (typeof addr === 'string') return addr;
        return addr.name || addr.address || "Location";
    };

    return (
        <APIProvider apiKey={API_KEY}>
            <div className="driver-app-container">
                {/* 1. Full Screen Map */}
                <div className="map-container">
                    <Map
                        defaultCenter={location}
                        center={location}
                        defaultZoom={15}
                        zoom={15}
                        disableDefaultUI={true}
                        gestureHandling={'greedy'}
                        mapId="DEMO_MAP_ID"
                    >
                        <Marker position={location} icon={{ url: "data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2218%22%20fill%3D%22%234285F4%22%20fill-opacity%3D%220.3%22%2F%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%228%22%20fill%3D%22%234285F4%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E", scaledSize: { width: 40, height: 40 } }} />

                        {isTripActive && directionProps && (
                            <Directions
                                origin={directionProps.origin}
                                destination={directionProps.destination}
                            />
                        )}
                    </Map>
                </div>

                {/* 2. Top UI Panel */}
                <div className="top-panel">
                    <div className="panel-row-1">
                        <img
                            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                            alt="Driver"
                            className="driver-avatar"
                            onClick={() => setIsMenuOpen(true)}
                        />
                        <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
                            <div className="status-dot"></div>
                            <span>{isOnline ? 'ON DUTY' : 'OFFLINE'}</span>
                        </div>
                        <button className="btn-notif">🔔</button>
                    </div>
                    <div className="panel-row-2">
                        <div className="stat-trips">12 Trips ⌄</div>
                        <div className="stat-earnings">₹1,704</div>
                        <div className="stat-coins"><span>🪙</span> 360</div>
                    </div>
                </div>

                {/* 3. Driver Menu */}
                <DriverMenu
                    isOpen={isMenuOpen}
                    onClose={() => setIsMenuOpen(false)}
                    driverId={driverId}
                />

                {/* 4. GO / STOP Button */}
                <div className={`go-button-container ${isTripActive || isOnline ? 'hidden' : ''}`}>
                    <button
                        className={`go-button ${isOnline ? 'online' : 'offline'} ${isLoading ? 'loading' : ''}`}
                        onClick={toggleAvailability}
                        disabled={isLoading}
                    >
                        {isLoading ? <div className="spinner"></div> : (isOnline ? "STOP" : "GO")}
                    </button>
                </div>

                {/* 5. Bottom Sheet */}
                <div className={`bottom-sheet ${sheetState}`}>
                    <div className="sheet-handle"></div>
                    <div className="sheet-content">
                        {sheetState === 'idle' && (
                            <div className="status-row">
                                <div style={{ textAlign: 'center' }}>
                                    <div className="status-title">{statusMessage}</div>
                                    <div className="status-subtitle">
                                        {isLoading ? "Please wait..." : "Go online to start receiving trips"}
                                    </div>
                                </div>
                            </div>
                        )}

                        {sheetState === 'searching' && (
                            <div className="searching-container">
                                <div style={{ textAlign: 'center', width: '100%' }}>
                                    <div className="status-title">Finding trips...</div>
                                    <div className="status-subtitle">Waiting for real ride requests</div>
                                    <div className="linear-progress-container">
                                        <div className="linear-progress-bar"></div>
                                    </div>
                                    <button className="btn-go-offline" onClick={handleGoOffline}>Go Offline</button>
                                </div>
                            </div>
                        )}

                        {sheetState === 'on-trip' && currentTrip && (
                            <div>
                                {currentTrip.status === 'DRIVER_ACCEPTED' && (
                                    <>
                                        <div className="trip-header">
                                            <span className="status-title">Pickup Passenger</span>
                                            <span className="trip-badge">Navigate</span>
                                        </div>
                                        <div className="address-group">
                                            <div className="address-label">Pickup Location</div>
                                            <div className="address-text">{getAddressName(currentTrip.pickup)}</div>
                                        </div>
                                        <button className="trip-btn btn-primary" onClick={handleArrived}>
                                            Arrived at Pickup
                                        </button>
                                    </>
                                )}

                                {currentTrip.status === 'DRIVER_ARRIVED' && (
                                    <>
                                        <div className="trip-header">
                                            <span className="status-title">Waiting for Passenger</span>
                                            <span className="trip-badge warning">Waiting</span>
                                        </div>
                                        <div className="passenger-info" style={{ padding: '10px 0' }}>
                                            <div style={{ fontSize: '18px', fontWeight: '600' }}>Passenger Name</div>
                                        </div>
                                        <button className="trip-btn btn-success" onClick={handleStartTrip}>
                                            Start Trip
                                        </button>
                                    </>
                                )}

                                {(currentTrip.status === 'ON_TRIP' || currentTrip.status === 'ACCEPTED') && (
                                    <>
                                        <div className="trip-header">
                                            <span className="status-title">Heading to Destination</span>
                                            <span className="trip-badge">On Trip</span>
                                        </div>
                                        <div className="address-group">
                                            <div className="address-label">Drop Location</div>
                                            <div className="address-text">{getAddressName(currentTrip.drop)}</div>
                                        </div>
                                        <div className="trip-actions-row">
                                            <button className="trip-btn btn-nav">Navigate</button>
                                            <button className="trip-btn btn-danger" onClick={handleCompleteTrip}>End Trip</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 6. Ride Request Popup */}
                {activeRequest && (
                    <RideRequestPopup
                        request={activeRequest}
                        onAccept={handleAccept}
                        onReject={handleReject}
                    />
                )}
            </div>
        </APIProvider>
    );
};

export default DriverHome;
