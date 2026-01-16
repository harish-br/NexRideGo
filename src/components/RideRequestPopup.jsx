import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

const RideRequestPopup = ({ request, onAccept, onReject }) => {
    if (!request) return null;

    const getAddress = (loc) => {
        if (!loc) return 'Unknown Location';
        if (typeof loc === 'string') return loc;
        return loc.name || loc.address || 'Unknown Location';
    };

    return (
        <div className="modal-overlay">
            <div className="request-card">
                <div className="req-header">
                    <h2 className="req-title">NeX Cab</h2>
                    <div className="req-subtitle" style={{ fontSize: '16px', fontWeight: '500', color: '#111' }}>
                        ₹240.50 • 2.4 km • Cash
                    </div>
                </div>

                <div className="req-locations">
                    <div className="loc-row">
                        <div className="loc-dot"></div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '11px', color: '#888', fontWeight: '600' }}>PICKUP</div>
                            <div style={{ fontSize: '15px', fontWeight: '600' }}>{getAddress(request.pickup)}</div>
                        </div>
                    </div>
                    <div className="loc-row">
                        <div className="loc-dot red"></div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '11px', color: '#888', fontWeight: '600' }}>DROP</div>
                            <div style={{ fontSize: '15px', fontWeight: '600' }}>{getAddress(request.drop)}</div>
                        </div>
                    </div>
                </div>

                <div className="req-actions">
                    <button
                        className="action-btn btn-reject"
                        onClick={() => onReject(request.tripId || request.id)}
                    >
                        Reject
                    </button>
                    <button
                        className="action-btn btn-accept"
                        onClick={() => onAccept(request.tripId || request.id)}
                    >
                        Accept Ride
                    </button>
                </div>
            </div>
        </div>
    );
};

RideRequestPopup.propTypes = {
    request: PropTypes.shape({
        id: PropTypes.string,
        tripId: PropTypes.string,
        pickup: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
        drop: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
    }),
    onAccept: PropTypes.func.isRequired,
    onReject: PropTypes.func.isRequired
};

export default RideRequestPopup;
