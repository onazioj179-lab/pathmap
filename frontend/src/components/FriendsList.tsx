/**
 * PATHMAP - Friends List Component
 * Display and manage friends
 */

import React, { useState, useEffect } from 'react';
import { friendsService, Friend, FriendRequest, UserSearchResult } from '../services/friendsService';
import { sharingService } from '../services/sharingService';

interface FriendsListProps {
  onSelectFriend?: (friend: Friend) => void;
  onViewLocation?: (friendId: string) => void;
}

export const FriendsList: React.FC<FriendsListProps> = ({ onSelectFriend: _onSelectFriend, onViewLocation }) => {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>({
    incoming: [],
    outgoing: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'search'>('friends');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  const loadFriends = async () => {
    try {
      const data = await friendsService.getFriends();
      setFriends(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const data = await friendsService.getPendingRequests();
      setRequests(data);
    } catch (e: any) {
      console.error('Failed to load requests:', e);
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
    } catch (e: any) {
      console.error('Search failed:', e);
    }
  };

  const handleSendRequest = async (userId: string) => {
    try {
      await friendsService.sendFriendRequest(userId);
      setSearchResults(results => results.filter(r => r.id !== userId));
      loadRequests();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAcceptRequest = async (fromUserId: string) => {
    try {
      await friendsService.acceptRequest(fromUserId);
      loadFriends();
      loadRequests();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDeclineRequest = async (fromUserId: string) => {
    try {
      await friendsService.declineRequest(fromUserId);
      loadRequests();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!confirm('Remove this friend?')) return;
    
    try {
      await friendsService.removeFriend(friendId);
      loadFriends();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleShareLocation = async (friendId: string) => {
    try {
      await sharingService.startSharing(friendId, 'approximate', 3600); // 1 hour
      alert('Started sharing your location for 1 hour');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const formatLastSeen = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() / 1000 - timestamp;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="friends-list bg-gray-900 rounded-xl p-4 max-w-md w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Friends</h2>
        <span className="text-sm text-gray-400">
          {friends.length} friend{friends.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('friends')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'friends'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Friends
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
            activeTab === 'requests'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Requests
          {requests.incoming.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {requests.incoming.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Add
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 text-red-300 p-3 rounded-lg mb-4 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right">×</button>
        </div>
      )}

      {/* Friends Tab */}
      {activeTab === 'friends' && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center text-gray-400 py-8">Loading...</div>
          ) : friends.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No friends yet. Search for people to add!
            </div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.user_id}
                className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
              >
                {/* Avatar */}
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {friend.avatar_url ? (
                      <img src={friend.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      friend.display_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  {/* Online indicator */}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                      friend.is_online ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">
                    {friend.nickname || friend.display_name}
                  </p>
                  <p className="text-gray-400 text-sm">
                    @{friend.username} · {friend.is_online ? 'Online' : formatLastSeen(friend.last_seen)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => onViewLocation?.(friend.user_id)}
                    className="p-2 text-blue-400 hover:bg-blue-900/30 rounded-lg transition-colors"
                    title="View location"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                  <button
                    onClick={() => handleShareLocation(friend.user_id)}
                    className="p-2 text-green-400 hover:bg-green-900/30 rounded-lg transition-colors"
                    title="Share your location"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  </button>
                  <button
                    onClick={() => handleRemoveFriend(friend.user_id)}
                    className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                    title="Remove friend"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Incoming */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Incoming ({requests.incoming.length})
            </h3>
            {requests.incoming.length === 0 ? (
              <p className="text-gray-500 text-sm">No pending requests</p>
            ) : (
              <div className="space-y-2">
                {requests.incoming.map((request) => (
                  <div
                    key={request.request_id}
                    className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold">
                      {request.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium">{request.display_name}</p>
                      <p className="text-gray-400 text-sm">@{request.username}</p>
                      {request.message && (
                        <p className="text-gray-300 text-sm mt-1">"{request.message}"</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAcceptRequest(request.from_user_id!)}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineRequest(request.from_user_id!)}
                        className="px-3 py-1 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outgoing */}
          <div>
            <h3 className="text-sm font-medium text-gray-400 mb-2">
              Sent ({requests.outgoing.length})
            </h3>
            {requests.outgoing.length === 0 ? (
              <p className="text-gray-500 text-sm">No pending sent requests</p>
            ) : (
              <div className="space-y-2">
                {requests.outgoing.map((request) => (
                  <div
                    key={request.request_id}
                    className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg opacity-75"
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-300 font-bold">
                      {request.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-300">{request.display_name}</p>
                      <p className="text-gray-500 text-sm">Pending...</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div>
          <input
            type="text"
            placeholder="Search by username or name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
          />

          <div className="space-y-2 max-h-72 overflow-y-auto">
            {searchResults.length === 0 && searchQuery.length >= 2 ? (
              <p className="text-gray-500 text-center py-4">No users found</p>
            ) : (
              searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-white font-bold">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      user.display_name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">{user.display_name}</p>
                    <p className="text-gray-400 text-sm">@{user.username}</p>
                  </div>
                  <button
                    onClick={() => handleSendRequest(user.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                  >
                    Add Friend
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FriendsList;
