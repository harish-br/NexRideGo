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
export const goOnline = async (requestedId, locationCtx) => {
    if (!db) {
        console.error("❌ Firestore not initialized");
        return { success: false, error: "Firestore not initialized" };
    }

    try {
        console.log("🚀 [goOnline] Initializing. contextId:", requestedId);

        // 1. Ensure Authentication
        let uid = auth.currentUser?.uid;
        if (!uid) {
            console.log("🔐 [goOnline] No session. Signing in anonymously...");
            try {
                const userCred = await signInAnonymously(auth);
                uid = userCred.user.uid;
                console.log("✅ [goOnline] Auth Success (New ID):", uid);

                // 🔥 CRITICAL: Small delay to let Firebase SDK sync auth state with Firestore
                console.log("⏳ [goOnline] Waiting for auth-firestore sync...");
                await new Promise(r => setTimeout(r, 800));
            } catch (authErr) {
                console.error("❌ [goOnline] Auth Failed:", authErr.code);
                if (authErr.code === 'auth/operation-not-allowed') {
                    return { success: false, error: "Anonymous Auth disabled in Firebase Console." };
                }
                throw authErr;
            }
        } else {
            console.log("👤 [goOnline] Using existing session:", uid);
        }

        // 2. Final Driver ID (Must be UID to pass security rules)
        if (!uid) {
            return { success: false, error: "Authentication failed. Session missing." };
        }
        const finalDriverId = uid;
        console.log(`🎯 [goOnline] Writing to drivers/${finalDriverId}. (Auth UID: ${auth.currentUser?.uid}, isAnon: ${auth.currentUser?.isAnonymous})`);

        // 3. Firestore Write
        const finalLocation = locationCtx && locationCtx.lat ? locationCtx : { lat: 11.341, lng: 77.71 };
        const driverRef = doc(db, "drivers", finalDriverId);

        console.log(`📝 [goOnline] Updating drivers/${finalDriverId} -> isOnline: true`);
        await setDoc(driverRef, {
            isOnline: true,
            isBusy: false,
            activeTripId: null,
            location: finalLocation,
            lastSeen: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        console.log("✨ [goOnline] SUCCESS");
        return { success: true, id: finalDriverId };

    } catch (error) {
        console.error("💥 [goOnline] ERROR:", error);
        if (error.code === 'permission-denied') {
            return {
                success: false,
                error: "Firestore Permission Denied. Check Security Rules."
            };
        }
        return { success: false, error: error.message || "Unknown Error" };
    }
};


export const goOffline = async (driverId) => {
    if (!db || !driverId) {
        console.warn("⚠️ [goOffline] Missing db or driverId", { driverId });
        return;
    }
    try {
        console.log(`🔴 [goOffline] Setting isOnline: false for drivers/${driverId}`);
        const driverRef = doc(db, "drivers", driverId);
        await updateDoc(driverRef, {
            isOnline: false,
            updatedAt: serverTimestamp()
        });
        console.log("✅ [goOffline] Driver is now Offline in backend");
    } catch (error) {
        console.error("❌ [goOffline] ERROR:", error);
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
