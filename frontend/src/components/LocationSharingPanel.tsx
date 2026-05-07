/**
 * PATHMAP - Location Sharing Panel Component
 * Manage location sharing with friends
 */

import React, { useState, useEffect } from 'react';
import { sharingService, FriendLocation, SharingSession } from '../services/sharingService';
import { friendsService, Friend } from '../services/friendsService';

interface LocationSharingPanelProps {
  onFriendLocationSelect?: (location: FriendLocation) => void;
  onClose?: () => void;
}

export const LocationSharingPanel: React.FC<LocationSharingPanelProps> = ({
  onFriendLocationSelect,
  onClose,
}) => {
  const [friendLocations, setFriendLocations] = useState<FriendLocation[]>([]);
  const [sharingSessions, setSharingSessions] = useState<{ incoming: SharingSession[]; outgoing: SharingSession[] }>({
    incoming: [],
    outgoing: [],
  });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [ghostMode, setGhostMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'map' | 'sharing' | 'geofences'>('map');
  const [error, setError] = useState<string | null>(null);

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedFriendToShare, setSelectedFriendToShare] = useState<string | null>(null);
  const [sharePrecision, setSharePrecision] = useState<'exact' | 'approximate' | 'city'>('approximate');
  const [shareDuration, setShareDuration] = useState<number | undefined>(3600);

  useEffect(() => {
    loadData();
    
    // Poll for friend locations every 30 seconds
    const interval = setInterval(loadFriendLocations, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      await Promise.all([
        loadFriendLocations(),
        loadSharingSessions(),
        loadFriends(),
      ]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadFriendLocations = async () => {
    try {
      const locations = await sharingService.getFriendLocations();
      setFriendLocations(locations);
    } catch (e) {
      console.error('Failed to load friend locations:', e);
    }
  };

  const loadSharingSessions = async () => {
    try {
      const sessions = await sharingService.getSharingSessions();
      setSharingSessions(sessions);
    } catch (e) {
      console.error('Failed to load sharing sessions:', e);
    }
  };

  const loadFriends = async () => {
    try {
      const data = await friendsService.getFriends();
      setFriends(data);
    } catch (e) {
      console.error('Failed to load friends:', e);
    }
  };

  const handleStartSharing = async () => {
    if (!selectedFriendToShare) return;

    try {
      await sharingService.startSharing(selectedFriendToShare, sharePrecision, shareDuration);
      setShowShareDialog(false);
      setSelectedFriendToShare(null);
      loadSharingSessions();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleStopSharing = async (friendId: string) => {
    try {
      await sharingService.stopSharing(friendId);
      loadSharingSessions();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggleGhostMode = async () => {
    try {
      await sharingService.setGhostMode(!ghostMode);
      setGhostMode(!ghostMode);
      if (!ghostMode) {
        loadSharingSessions(); // Refresh as all sessions should be stopped
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formatTimeAgo = (timestamp: number): string => {
    const diff = Date.now() / 1000 - timestamp;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatExpiry = (expiresAt?: number): string => {
    if (!expiresAt) return 'Until disabled';
    const remaining = expiresAt - Date.now() / 1000;
    if (remaining <= 0) return 'Expired';
    if (remaining < 3600) return `${Math.floor(remaining / 60)} min left`;
    if (remaining < 86400) return `${Math.floor(remaining / 3600)} hours left`;
    return `${Math.floor(remaining / 86400)} days left`;
  };

  const getPrecisionIcon = (precision: string): string => {
    switch (precision) {
      case 'exact': return '[Exact]';
      case 'approximate': return '[Approx]';
      case 'city': return '[City]';
      default: return '[Loc]';
    }
  };

  return (
    <div className="location-sharing-panel bg-gray-900 rounded-xl p-4 max-w-md w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Location Sharing</h2>
        <div className="flex items-center gap-2">
          {/* Ghost Mode Toggle */}
          <button
            onClick={handleToggleGhostMode}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              ghostMode
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title={ghostMode ? 'Disable Ghost Mode' : 'Enable Ghost Mode'}
          >
            {ghostMode ? 'Ghost ON' : 'Ghost'}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white"
              aria-label="Close panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('map')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'map'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Friends Map ({friendLocations.length})
        </button>
        <button
          onClick={() => setActiveTab('sharing')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'sharing'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          My Sharing ({sharingSessions.outgoing.length})
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 text-red-300 p-3 rounded-lg mb-4 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right">×</button>
        </div>
      )}

      {/* Ghost Mode Warning */}
      {ghostMode && (
        <div className="bg-purple-900/50 text-purple-300 p-3 rounded-lg mb-4 text-sm flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          Ghost mode active. Your location is hidden from everyone.
        </div>
      )}

      {/* Friends Map Tab */}
      {activeTab === 'map' && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : friendLocations.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-gray-700 flex items-center justify-center">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <p>No friends sharing location with you</p>
              <p className="text-sm mt-1">Ask friends to share their location!</p>
            </div>
          ) : (
            friendLocations.map((location) => (
              <div
                key={location.user_id}
                onClick={() => onFriendLocationSelect?.(location)}
                className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 cursor-pointer transition-colors"
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-bold">
                  {location.avatar_url ? (
                    <img src={location.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    location.display_name.charAt(0).toUpperCase()
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">
                    {location.display_name}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {getPrecisionIcon(location.precision)} {location.precision} · Updated {formatTimeAgo(location.timestamp)}
                  </p>
                  {location.expires_at && (
                    <p className="text-blue-400 text-xs">
                      {formatExpiry(location.expires_at)}
                    </p>
                  )}
                </div>

                {/* View on map button */}
                <button className="p-2 text-blue-400 hover:bg-blue-900/30 rounded-lg" aria-label="View on map">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* My Sharing Tab */}
      {activeTab === 'sharing' && (
        <div className="space-y-4">
          {/* Share with new friend button */}
          <button
            onClick={() => setShowShareDialog(true)}
            disabled={ghostMode}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            + Share My Location
          </button>

          {/* Outgoing shares */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Sharing with ({sharingSessions.outgoing.length})
            </h3>
            
            {sharingSessions.outgoing.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                Not sharing with anyone
              </p>
            ) : (
              <div className="space-y-2">
                {sharingSessions.outgoing.map((session) => (
                  <div
                    key={session.session_id}
                    className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center text-white font-bold">
                      {session.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{session.display_name}</p>
                      <p className="text-gray-400 text-sm">
                        {getPrecisionIcon(session.precision)} {session.precision} · {formatExpiry(session.expires_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleStopSharing(session.user_id)}
                      className="px-3 py-1 bg-red-600/20 text-red-400 rounded-lg text-sm hover:bg-red-600/30"
                    >
                      Stop
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Incoming shares */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Shared with me ({sharingSessions.incoming.length})
            </h3>
            
            {sharingSessions.incoming.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">
                No one sharing with you
              </p>
            ) : (
              <div className="space-y-2">
                {sharingSessions.incoming.map((session) => (
                  <div
                    key={session.session_id}
                    className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {session.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{session.display_name}</p>
                      <p className="text-gray-400 text-sm">
                        {getPrecisionIcon(session.precision)} {session.precision} · {formatExpiry(session.expires_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share Dialog */}
      {showShareDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-4">Share Your Location</h3>

            {/* Friend Selection */}
            <div className="mb-4">
              <label id="friend-select-label" className="block text-sm text-gray-400 mb-2">Share with</label>
              <select
                aria-labelledby="friend-select-label"
                title="Select a friend to share location with"
                value={selectedFriendToShare || ''}
                onChange={(e) => setSelectedFriendToShare(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white"
              >
                <option value="">Select a friend</option>
                {friends.map((friend) => (
                  <option key={friend.user_id} value={friend.user_id}>
                    {friend.display_name} (@{friend.username})
                  </option>
                ))}
              </select>
            </div>

            {/* Precision Selection */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Precision</label>
              <div className="grid grid-cols-3 gap-2">
                {(['exact', 'approximate', 'city'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setSharePrecision(p)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                      sharePrecision === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {getPrecisionIcon(p)} {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration Selection */}
            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '1 hour', value: 3600 },
                  { label: '4 hours', value: 14400 },
                  { label: '8 hours', value: 28800 },
                  { label: 'Until off', value: undefined },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setShareDuration(opt.value)}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                      shareDuration === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowShareDialog(false)}
                className="flex-1 py-3 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleStartSharing}
                disabled={!selectedFriendToShare}
                className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationSharingPanel;
