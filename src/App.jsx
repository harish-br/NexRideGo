import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import DriverHome from './pages/DriverHome';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Redirect root to /driver as per prompt this is the Driver App */}
        <Route path="/" element={<Navigate to="/driver" replace />} />
        <Route path="/driver" element={<DriverHome />} />
      </Routes>
    </Router>
  );
}

export default App;
