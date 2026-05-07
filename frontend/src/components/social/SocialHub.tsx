/**
 * PATHMAP - Social Hub Component
 * Central hub for all social features: Friends, Sharing, Tracking
 */

import React, { useState, useEffect } from 'react';
import { authService } from '../../services/authService';
import { friendsService, Friend } from '../../services/friendsService';
import { sharingService, FriendLocation } from '../../services/sharingService';

interface SocialHubProps {
  isOpen: boolean;
  onClose: () => void;
  map?: any;
  onShowAuth: () => void;
  onFriendLocationClick?: (lat: number, lng: number) => void;
}

type TabType = 'friends' | 'sharing' | 'tracking' | 'settings';

const SocialHub: React.FC<SocialHubProps> = ({
  isOpen,
  onClose,
  onShowAuth,
  onFriendLocationClick,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendLocations, setFriendLocations] = useState<FriendLocation[]>([]);
  const [pendingRequests, setPendingRequests] = useState<number>(0);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [ghostMode, setGhostMode] = useState(false);
  const [activeSharingSessions, setActiveSharingSessions] = useState<any[]>([]);

  // Check auth status
  useEffect(() => {
    setIsAuthenticated(authService.isAuthenticated());

    const unsubscribe = authService.onAuthChange((authenticated: boolean) => {
      setIsAuthenticated(authenticated);
      if (authenticated) {
        loadData();
      }
    });

    return () => unsubscribe();
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [friendsData, requestsData, locations, sessions] = await Promise.all([
        friendsService.getFriends(),
        friendsService.getPendingRequests(),
        sharingService.getFriendLocations(),
        sharingService.getActiveSessions().catch(() => []),
      ]);
      setFriends(friendsData);
      setPendingRequests(requestsData.incoming.length);
      setIncomingRequests(requestsData.incoming);
      setFriendLocations(locations);
      setActiveSharingSessions(sessions);
    } catch (e) {
      console.error('Failed to load social data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await friendsService.searchUsers(query);
      setSearchResults(results);
    } catch (e) {
      console.error('Search failed:', e);
    }
  };

  const handleSendRequest = async (userId: string) => {
    try {
      await friendsService.sendFriendRequest(userId);
      setSearchResults(r => r.filter(u => u.id !== userId));
    } catch (e: any) {
      alert(e.message || 'Failed to send request');
    }
  };

  const handleAcceptRequest = async (fromUserId: string) => {
    try {
      await friendsService.acceptRequest(fromUserId);
      loadData();
    } catch (e: any) {
      alert(e.message || 'Failed to accept request');
    }
  };

  const handleShareLocation = async (friendId: string, duration: number = 3600) => {
    try {
      await sharingService.startSharing(friendId, 'approximate', duration);
      alert(`Started sharing location for ${duration / 60} minutes`);
    } catch (e: any) {
      alert(e.message || 'Failed to start sharing');
    }
  };

  const handleStopSharing = async (friendId: string) => {
    try {
      await sharingService.stopSharing(friendId);
      loadData();
    } catch (e: any) {
      alert(e.message || 'Failed to stop sharing');
    }
  };

  const toggleGhostMode = async () => {
    try {
      await sharingService.setGhostMode(!ghostMode);
      setGhostMode(!ghostMode);
    } catch (e: any) {
      alert(e.message || 'Failed to toggle ghost mode');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - click to close */}
      <div 
        className="social-hub-backdrop"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="social-hub-panel">
        {/* Header */}
        <div className="social-hub-header">
        <h2 className="social-hub-title">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Social Hub
        </h2>
        <button
          onClick={onClose}
          className="social-hub-close"
          aria-label="Close social hub"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Not Authenticated */}
      {!isAuthenticated && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mb-4">
            <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Sign in to Connect</h3>
          <p className="text-gray-400 mb-6">
            Create an account to find friends, share your location, and track loved ones in real-time.
          </p>
          <button
            onClick={onShowAuth}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            Sign In or Register
          </button>
        </div>
      )}

      {/* Authenticated Content */}
      {isAuthenticated && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            {(['friends', 'sharing', 'tracking', 'settings'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'friends' && pendingRequests > 0 && (
                  <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {pendingRequests}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <>
                {/* Friends Tab */}
                {activeTab === 'friends' && (
                  <div className="p-4 space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search users..."
                        className="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <svg className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 uppercase">Search Results</p>
                        {searchResults.map((user) => (
                          <div key={user.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {user.display_name?.[0] || user.username[0]}
                              </div>
                              <div>
                                <p className="text-white font-medium">{user.display_name || user.username}</p>
                                <p className="text-gray-400 text-sm">@{user.username}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleSendRequest(user.id)}
                              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Incoming Friend Requests */}
                    {incomingRequests.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 uppercase flex items-center gap-2">
                          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                          Pending Requests ({incomingRequests.length})
                        </p>
                        {incomingRequests.map((req: any) => (
                          <div key={req.from_user_id} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-yellow-600/30">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {req.from_display_name?.[0] || req.from_username?.[0] || '?'}
                              </div>
                              <div>
                                <p className="text-white font-medium">{req.from_display_name || req.from_username}</p>
                                <p className="text-gray-400 text-sm">Wants to be friends</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleAcceptRequest(req.from_user_id)}
                              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
                            >
                              Accept
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Friends List */}
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 uppercase">My Friends ({friends.length})</p>
                      {friends.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">
                          No friends yet. Search to add friends!
                        </p>
                      ) : (
                        friends.map((friend) => (
                          <div key={friend.user_id} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-full flex items-center justify-center text-white font-semibold">
                                  {friend.display_name?.[0] || friend.username[0]}
                                </div>
                                {friend.is_online && (
                                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></div>
                                )}
                              </div>
                              <div>
                                <p className="text-white font-medium">{friend.display_name || friend.username}</p>
                                <p className="text-gray-400 text-xs">
                                  {friend.is_online ? 'Online' : 'Offline'}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleShareLocation(friend.user_id)}
                              className="p-2 text-blue-400 hover:bg-gray-700 rounded-lg"
                              title="Share location"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Sharing Tab */}
                {activeTab === 'sharing' && (
                  <div className="p-4 space-y-4">
                    {/* Ghost Mode */}
                    <div className={`p-4 rounded-xl ${ghostMode ? 'bg-purple-900/50 border border-purple-700' : 'bg-gray-800'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-600/30">
                            <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <div>
                            <p className="text-white font-medium">Ghost Mode</p>
                            <p className="text-gray-400 text-sm">Hide your location from everyone</p>
                          </div>
                        </div>
                        <button
                          onClick={toggleGhostMode}
                          aria-label="Toggle ghost mode"
                          className={`w-12 h-6 rounded-full transition-colors ${
                            ghostMode ? 'bg-purple-600' : 'bg-gray-600'
                          }`}
                        >
                          <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                            ghostMode ? 'translate-x-6' : 'translate-x-0.5'
                          }`}></div>
                        </button>
                      </div>
                    </div>

                    {/* Active Sharing Sessions */}
                    {activeSharingSessions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 uppercase flex items-center gap-2">
                          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                          You're Sharing With ({activeSharingSessions.length})
                        </p>
                        {activeSharingSessions.map((session: any) => (
                          <div key={session.shared_with_id} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl border border-green-600/30">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-semibold">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              </div>
                              <div>
                                <p className="text-white font-medium">{session.shared_with_name || 'Friend'}</p>
                                <p className="text-gray-400 text-xs">{session.precision} location</p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleStopSharing(session.shared_with_id)}
                              className="px-3 py-1.5 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30"
                            >
                              Stop
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Friend Locations */}
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500 uppercase">Friends Sharing With You</p>
                      {friendLocations.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-8">
                          No friends sharing their location
                        </p>
                      ) : (
                        friendLocations.map((loc) => (
                          <button
                            key={loc.user_id}
                            onClick={() => onFriendLocationClick?.(loc.latitude, loc.longitude)}
                            className="w-full flex items-center justify-between p-3 bg-gray-800 rounded-xl hover:bg-gray-750 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-pink-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {loc.display_name?.[0] || '?'}
                              </div>
                              <div>
                                <p className="text-white font-medium">{loc.display_name}</p>
                                <p className="text-gray-400 text-xs">
                                  {loc.precision === 'exact' ? 'Exact location' : 
                                   loc.precision === 'approximate' ? 'Approximate' : 'City level'}
                                </p>
                              </div>
                            </div>
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Tracking Tab */}
                {activeTab === 'tracking' && (
                  <div className="p-4 space-y-4">
                    <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 border border-blue-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 bg-blue-600/30 rounded-xl flex items-center justify-center">
                          <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-white font-semibold">Precision Tracking</h3>
                          <p className="text-gray-400 text-sm">Real-time GPS + compass fusion</p>
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm mb-4">
                        Track friends with state-of-the-art precision using Kalman filter sensor fusion. See animated trails showing their path.
                      </p>
                      <button className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                        Start Tracking Session
                      </button>
                    </div>

                    <div className="text-gray-400 text-sm text-center py-4">
                      Select a friend to start tracking their location in real-time
                    </div>
                  </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                  <div className="p-4 space-y-4">
                    <div className="space-y-3">
                      {[
                        { label: 'Share Exact Location', desc: 'Allow friends to see your exact position' },
                        { label: 'Show Online Status', desc: 'Let friends know when you\'re active' },
                        { label: 'Allow Location Requests', desc: 'Friends can request to see your location' },
                      ].map((setting, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-800 rounded-xl">
                          <div>
                            <p className="text-white font-medium">{setting.label}</p>
                            <p className="text-gray-400 text-xs">{setting.desc}</p>
                          </div>
                          <button 
                            className="w-12 h-6 bg-blue-600 rounded-full"
                            aria-label={`Toggle ${setting.label}`}
                          >
                            <div className="w-5 h-5 bg-white rounded-full translate-x-6"></div>
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        authService.logout();
                        onClose();
                      }}
                      className="w-full py-3 bg-red-600/20 text-red-400 rounded-xl font-medium hover:bg-red-600/30 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
    </>
  );
};

export default SocialHub;
