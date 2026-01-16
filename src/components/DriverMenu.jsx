import React from 'react';
import './DriverMenu.css';

const DriverMenu = ({ isOpen, onClose, driverName = "Harish BR", driverId = "DRV-8832" }) => {
    return (
        <>
            {/* Overlay */}
            <div className={`menu-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}></div>

            {/* Sidebar Profile */}
            <div className={`driver-menu ${isOpen ? 'open' : ''}`}>

                {/* 1. Profile Header */}
                <div className="menu-header-bg">
                    <div className="header-title">
                        <h2>Profile</h2>
                        <p>Manage your driver account</p>
                    </div>
                    <div className="header-avatar-mini">
                        {/* Placeholder for small avatar in header */}
                    </div>
                </div>

                <div className="profile-card-container">
                    {/* 2. Driver Info Card */}
                    <div className="driver-info-card">
                        <img
                            src="https://cdn-icons-png.flaticon.com/512/149/149071.png"
                            alt="Driver"
                            className="big-avatar"
                        />
                        <div className="card-details">
                            <h3>{driverName}</h3>
                            <div className="vehicle">Toyota Etios • TN 33 AA 1234</div>
                            <div className="star-rating">
                                <span>⭐ 4.8</span>
                            </div>
                        </div>
                    </div>

                    {/* 3. Stats Row */}
                    <div className="profile-stats-row">
                        <div className="p-stat-item">
                            <span className="p-stat-val">12</span>
                            <span className="p-stat-label">Trips</span>
                        </div>
                        <div className="p-stat-item">
                            <span className="p-stat-val">4.5h</span>
                            <span className="p-stat-label">Online</span>
                        </div>
                        <div className="p-stat-item">
                            <span className="p-stat-val">₹1,704</span>
                            <span className="p-stat-label">Earnings</span>
                        </div>
                    </div>
                </div>

                {/* 4. Menu List */}
                <div className="menu-section">
                    <ul className="menu-list-ul">
                        <MenuItem icon="👤" title="Your Details" subtitle="Verified Driver" />
                        <MenuItem icon="🕒" title="Your Trips" subtitle="History & completed rides" />
                        <MenuItem icon="💰" title="Earnings" subtitle="Daily, weekly & monthly" />
                        <MenuItem icon="💳" title="Wallet" subtitle="Balance & payouts" />
                        <MenuItem icon="🛡️" title="Safety Center" subtitle="Emergency & support" />
                        <MenuItem icon="⚙️" title="Settings" subtitle="App & account preferences" />
                    </ul>
                </div>

                {/* 5. Logout */}
                <div className="logout-section">
                    <div className="menu-item logout">
                        <div className="menu-icon-box">
                            <span>🚪</span>
                        </div>
                        <div className="menu-text">
                            <span className="menu-title">Logout</span>
                        </div>
                    </div>
                </div>

                {/* 6. Footer */}
                <div className="profile-footer">
                    NexRide Driver App v1.0 • ID: {driverId}
                </div>
            </div>
        </>
    );
};

const MenuItem = ({ icon, title, subtitle }) => (
    <li className="menu-item">
        <div className="menu-icon-box">
            <span>{icon}</span>
        </div>
        <div className="menu-text">
            <span className="menu-title">{title}</span>
            <span className="menu-sub">{subtitle}</span>
        </div>
        <div className="chevron">›</div>
    </li>
);

export default DriverMenu;
