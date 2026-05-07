/**
 * PATHMAP - Friends Service
 * API client for friend management
 */

import { authService } from './authService';

export interface Friend {
  friendship_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  nickname?: string;
  status: 'pending' | 'accepted';
  since: number;
  is_online: boolean;
  last_seen?: number;
}

export interface FriendRequest {
  request_id: string;
  from_user_id?: string;
  to_user_id?: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  message?: string;
  created_at: number;
}

export interface FriendGroup {
  id: string;
  name: string;
  color: string;
  icon: string;
  can_see_location: boolean;
  location_precision: 'exact' | 'approximate' | 'city';
  member_count: number;
  created_at: number;
  updated_at: number;
}

export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  added_at: number;
}

export interface UserSearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
}

class FriendsService {
  private baseUrl = '/api/v1/social';

  /**
   * Get all friends
   */
  async getFriends(): Promise<Friend[]> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/friends`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Search for users
   */
  async searchUsers(query: string, limit: number = 20): Promise<UserSearchResult[]> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/users/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    const result = await response.json();
    return result.data;
  }

  /**
   * Send friend request
   */
  async sendFriendRequest(toUserId: string, message?: string): Promise<void> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_user_id: toUserId, message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to send friend request');
    }
  }

  /**
   * Get pending friend requests
   */
  async getPendingRequests(): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/friends/requests`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Accept friend request
   */
  async acceptRequest(fromUserId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/friends/accept/${fromUserId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to accept request');
    }
  }

  /**
   * Decline friend request
   */
  async declineRequest(fromUserId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/friends/decline/${fromUserId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to decline request');
    }
  }

  /**
   * Remove friend
   */
  async removeFriend(friendId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/friends/${friendId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to remove friend');
    }
  }

  /**
   * Block user
   */
  async blockUser(userId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/friends/block/${userId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to block user');
    }
  }

  /**
   * Unblock user
   */
  async unblockUser(userId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/friends/unblock/${userId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to unblock user');
    }
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(): Promise<any[]> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/friends/blocked`);
    const result = await response.json();
    return result.data;
  }

  // ============== FRIEND GROUPS ==============

  /**
   * Get all friend groups
   */
  async getGroups(): Promise<FriendGroup[]> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/groups`);
    const result = await response.json();
    return result.data;
  }

  /**
   * Create friend group
   */
  async createGroup(data: {
    name: string;
    color?: string;
    icon?: string;
    can_see_location?: boolean;
    location_precision?: string;
  }): Promise<string> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create group');
    }

    const result = await response.json();
    return result.data.group_id;
  }

  /**
   * Update friend group
   */
  async updateGroup(groupId: string, data: Partial<FriendGroup>): Promise<void> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/groups/${groupId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to update group');
    }
  }

  /**
   * Delete friend group
   */
  async deleteGroup(groupId: string): Promise<void> {
    const response = await authService.authenticatedFetch(`${this.baseUrl}/groups/${groupId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete group');
    }
  }

  /**
   * Get group members
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/groups/${groupId}/members`
    );
    const result = await response.json();
    return result.data;
  }

  /**
   * Add member to group
   */
  async addGroupMember(groupId: string, friendId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/groups/${groupId}/members/${friendId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to add member');
    }
  }

  /**
   * Remove member from group
   */
  async removeGroupMember(groupId: string, friendId: string): Promise<void> {
    const response = await authService.authenticatedFetch(
      `${this.baseUrl}/groups/${groupId}/members/${friendId}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to remove member');
    }
  }
}

// Export singleton instance
export const friendsService = new FriendsService();
