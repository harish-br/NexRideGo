import React from 'react';
import PropTypes from 'prop-types';

const RideRequestPopup = ({ request, onAccept, onReject }) => {
    if (!request) return null;

    return (
        <div className="popup-overlay">
            <div className="popup-card">
                <h2 className="popup-title">New Ride Request 🚨</h2>

                <div className="popup-details">
                    <div className="detail-row">
                        <span className="label">Pickup:</span>
                        <span className="value">
                            {typeof request.pickup === 'object' ? (request.pickup.name || request.pickup.address || JSON.stringify(request.pickup)) : request.pickup}
                        </span>
                    </div>
                    <div className="detail-row">
                        <span className="label">Drop:</span>
                        <span className="value">
                            {typeof request.drop === 'object' ? (request.drop.name || request.drop.address || JSON.stringify(request.drop)) : request.drop}
                        </span>
                    </div>
                </div>

                <div className="popup-actions">
                    <button className="btn-accept" onClick={() => onAccept(request.tripId || request.id)}>
                        Agreed / Accept
                    </button>
                    <button className="btn-reject" onClick={() => onReject(request.tripId || request.id)}>
                        Reject
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
        pickup: PropTypes.string,
        drop: PropTypes.string
    }),
    onAccept: PropTypes.func.isRequired,
    onReject: PropTypes.func.isRequired
};

export default RideRequestPopup;
