// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAc_V5V4VGQS5mn7qMb3uKMAnSr8FVy2d4",
  authDomain: "nexridein.firebaseapp.com",
  projectId: "nexridein",
  storageBucket: "nexridein.firebasestorage.app",
  messagingSenderId: "320418103794",
  appId: "1:320418103794:web:b1a5eee328dc1bf19f2b6b",
  measurementId: "G-SJT3M5E1GJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
import { getAuth } from "firebase/auth";
const auth = getAuth(app);

console.log("Firebase initialized successfully");

export { db, auth };
