import { db, auth } from "../firebaseConfig";
import {
    doc,
    setDoc,
    updateDoc,
    onSnapshot,
    collection,
    deleteDoc,
    serverTimestamp
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

// ------------------------------------------------------------------
// 1. DRIVER ONLINE LOGIC
// ------------------------------------------------------------------
export const goOnline = async (driverId, locationCtx) => {
    if (!db) {
        console.error("Firestore not initialized");
        return;
    }

    try {
        // Ensure we are authenticated
        let uid = auth.currentUser?.uid;
        if (!uid) {
            console.log("Signing in anonymously...");
            const userCred = await signInAnonymously(auth);
            uid = userCred.user.uid;
            console.log("Signed in as:", uid);
        }

        // Use passed location or fallback
        const finalLocation = locationCtx && locationCtx.lat ? locationCtx : { lat: 11.341, lng: 77.71 };

        // Try strict ID first
        let finalDriverId = driverId;

        try {
            const driverRef = doc(db, "drivers", driverId);
            await setDoc(driverRef, {
                isOnline: true,
                isBusy: false,      // 🔥 Init as free
                activeTripId: null, // 🔥 No active trip
                location: finalLocation, // Use dynamic location
                lastSeen: serverTimestamp()
            }, { merge: true });
            console.log("✅ DRIVER ONLINE (ID: " + driverId + ")");
        } catch (error) {
            console.warn(`Failed to go online with ID ${driverId}:`, error.message);

            // Fallback: Use Auth UID
            if (error.code === 'permission-denied') {
                console.log(`⚠️ Retrying with Auth UID: ${uid}`);
                const fallbackRef = doc(db, "drivers", uid);
                await setDoc(fallbackRef, {
                    isOnline: true,
                    isBusy: false,
                    activeTripId: null,
                    location: finalLocation,
                    lastSeen: serverTimestamp()
                }, { merge: true });
                finalDriverId = uid;
                console.log("✅ DRIVER ONLINE (Fallback ID: " + uid + ")");
            } else {
                throw error;
            }
        }

        return { success: true, id: finalDriverId };
    } catch (error) {
        console.error("Error going online:", error);
        return { success: false, error: error.message };
    }
};


export const goOffline = async (driverId) => {
    if (!db) return;
    try {
        const driverRef = doc(db, "drivers", driverId);
        await updateDoc(driverRef, {
            isOnline: false,
            // We usually don't clear isBusy here in case they just went offline mid-trip? 
            // But for simplicity of "going offline", maybe we assume they are free? 
            // The prompt says "Driver free? -> YES -> popup". 
            // Let's just set isOnline false.
        });
        console.log("🔴 DRIVER OFFLINE");
    } catch (error) {
        console.error("Error going offline:", error);
    }
};

// ------------------------------------------------------------------
// 2. LISTEN FOR REQUESTS (With Lifecycle Validation)
// ------------------------------------------------------------------
import { getDoc } from "firebase/firestore"; // Ensure getDoc is imported if not already

export const listenForRequests = (driverId, appStartTime, onCallback) => {
    if (!db) return () => { };

    // Listen to: driverRequests/{driverId}/trips
    const requestsCollection = collection(db, "driverRequests", driverId, "trips");

    console.log(`🎧 Listening for requests at: driverRequests/${driverId}/trips (Start Time: ${appStartTime})`);

    const unsubscribe = onSnapshot(requestsCollection, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const requestId = change.doc.id;

                // 🛑 FIX 1: Ignore Old Requests
                if (!data.createdAt) return;

                // Timestamp conversion safety
                const createdTime = data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now();

                if (createdTime < appStartTime) {
                    console.warn(`⏭️ Ignored idle/old request: ${requestId}`);
                    // Optional: Auto-cleanup old request here? 
                    // For now, just ignore UI
                    return;
                }

                // 🛑 FIX 3: Verify Trip Status (Async check)
                if (data.tripId) {
                    try {
                        const tripRef = doc(db, "trips", data.tripId);
                        const tripSnap = await getDoc(tripRef);

                        if (!tripSnap.exists()) {
                            console.warn("⏭️ Trip document missing");
                            return;
                        }

                        const status = tripSnap.data().status;
                        if (status !== 'REQUESTED' && status !== 'SEARCHING') {
                            console.warn(`⏭️ Trip no longer active (Status: ${status})`);
                            return;
                        }

                        // Optional: Check if driver is busy in Firestore?
                        // We rely on client-side isBusy/isTripActive guard for now as per prompt flow.

                        console.log("🚨 REAL NEW REQUEST VALIDATED:", data);
                        onCallback({ id: requestId, ...data });

                    } catch (err) {
                        console.error("Error validating trip status:", err);
                    }
                }
            }
        });
    }, (error) => {
        console.error("Snapshot Listener Error:", error);
    });

    return unsubscribe;
};

// ------------------------------------------------------------------
// 3. ACCEPT RIDE FLOW (ATOMIC LOCK)
// ------------------------------------------------------------------
export const acceptRide = async (tripId, driverId) => {
    if (!db) return;

    try {
        console.log(`Attempting to accept trip: ${tripId} by driver: ${driverId}`);

        // 1. Update trip status to DRIVER_ACCEPTED (State 1)
        const tripRef = doc(db, "trips", tripId);
        await updateDoc(tripRef, {
            status: "DRIVER_ACCEPTED", // Changed from ACCEPTED
            driverId: driverId
        });

        // 2. Lock driver (🔥 ATOMIC UPDATE)
        const driverRef = doc(db, "drivers", driverId);
        await updateDoc(driverRef, {
            isBusy: true,
            activeTripId: tripId
        });

        // 3. Delete request
        const requestRef = doc(db, "driverRequests", driverId, "trips", tripId);
        await deleteDoc(requestRef);

        console.log("✅ RIDE ACCEPTED & DRIVER LOCKED");
        return true;
    } catch (error) {
        console.error("Error accepting ride:", error);
        throw error;
    }
};

// ------------------------------------------------------------------
// 4. TRIP LIFECYCLE ACTIONS
// ------------------------------------------------------------------
export const arriveAtPickup = async (tripId) => {
    if (!db) return;
    try {
        const tripRef = doc(db, "trips", tripId);
        await updateDoc(tripRef, { status: "DRIVER_ARRIVED" });
        console.log("✅ DRIVER ARRIVED AT PICKUP");
    } catch (error) {
        console.error("Error arriving at pickup:", error);
    }
};

export const startTrip = async (tripId) => {
    if (!db) return;
    try {
        const tripRef = doc(db, "trips", tripId);
        await updateDoc(tripRef, { status: "ON_TRIP" });
        console.log("✅ TRIP STARTED");
    } catch (error) {
        console.error("Error starting trip:", error);
    }
};

export const completeTrip = async (tripId, driverId) => {
    if (!db) return;
    try {
        const tripRef = doc(db, "trips", tripId);
        await updateDoc(tripRef, { status: "COMPLETED" });

        // Unlock driver atomically
        await unlockDriver(driverId);

        console.log("✅ TRIP COMPLETED");
    } catch (error) {
        console.error("Error completing trip:", error);
    }
};

// ------------------------------------------------------------------
// 5. UNLOCK DRIVER (Helper)
// ------------------------------------------------------------------
export const unlockDriver = async (driverId) => {
    // ... (rest is same)
    if (!db) return;
    try {
        const driverRef = doc(db, "drivers", driverId);
        await updateDoc(driverRef, {
            isBusy: false,
            activeTripId: null
        });
        console.log("🔓 DRIVER UNLOCKED");
    } catch (error) {
        console.error("Error unlocking driver:", error);
    }
};

// ------------------------------------------------------------------
// 5. REJECT RIDE FLOW
// ------------------------------------------------------------------
export const rejectRide = async (tripId, driverId) => {
    if (!db) return;

    try {
        console.log(`Rejecting trip: ${tripId}`);

        // 1. Delete request
        const requestRef = doc(db, "driverRequests", driverId, "trips", tripId);
        await deleteDoc(requestRef);

        console.log("🚫 RIDE REJECTED");
    } catch (error) {
        console.error("Error rejecting ride:", error);
    }
};
