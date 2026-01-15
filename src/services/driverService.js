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
export const goOnline = async (driverId) => {
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

        // Try strict ID first
        let finalDriverId = driverId;
        const location = { lat: 11.341, lng: 77.71 };

        try {
            const driverRef = doc(db, "drivers", driverId);
            await setDoc(driverRef, {
                isOnline: true,
                location: location,
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
                    location: location,
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
            isOnline: false
        });
        console.log("🔴 DRIVER OFFLINE");
    } catch (error) {
        console.error("Error going offline:", error);
    }
};

// ------------------------------------------------------------------
// 2. LISTEN FOR REQUESTS
// ------------------------------------------------------------------
export const listenForRequests = (driverId, onCallback) => {
    if (!db) return () => { };

    // Listen to: driverRequests/{driverId}/trips
    const requestsCollection = collection(db, "driverRequests", driverId, "trips");

    console.log(`🎧 Listening for requests at: driverRequests/${driverId}/trips`);

    const unsubscribe = onSnapshot(requestsCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                console.log("🚨 REQUEST RECEIVED:", change.doc.data());
                // Pass the request data + ID to the callback
                onCallback({ id: change.doc.id, ...change.doc.data() });
            }
        });
    }, (error) => {
        console.error("Snapshot Listener Error:", error);
    });

    return unsubscribe;
};

// ------------------------------------------------------------------
// 3. ACCEPT RIDE FLOW
// ------------------------------------------------------------------
export const acceptRide = async (tripId, driverId) => {
    if (!db) return;

    try {
        console.log(`Attempting to accept trip: ${tripId} by driver: ${driverId}`);

        // 1. Update trip status
        const tripRef = doc(db, "trips", tripId);
        await updateDoc(tripRef, {
            status: "ACCEPTED",
            driverId: driverId
        });

        // 2. Delete request
        const requestRef = doc(db, "driverRequests", driverId, "trips", tripId);
        await deleteDoc(requestRef);

        // 3. Update driver status (Busy/Offline for new requests)
        await goOffline(driverId); // "isOnline: false" as per prompt

        console.log("✅ RIDE ACCEPTED");
        return true;
    } catch (error) {
        console.error("Error accepting ride:", error);
        throw error;
    }
};

// ------------------------------------------------------------------
// 4. REJECT RIDE FLOW
// ------------------------------------------------------------------
export const rejectRide = async (tripId, driverId) => {
    if (!db) return;

    try {
        console.log(`Rejecting trip: ${tripId}`);

        // 1. Delete request
        const requestRef = doc(db, "driverRequests", driverId, "trips", tripId);
        await deleteDoc(requestRef);

        // Driver stays ONLINE (no change needed as they are already online)
        console.log("🚫 RIDE REJECTED");
    } catch (error) {
        console.error("Error rejecting ride:", error);
    }
};
