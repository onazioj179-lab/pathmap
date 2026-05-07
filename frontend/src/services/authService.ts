/**
 * PATHMAP - Authentication Service
 * API client for auth endpoints
 */

// API base URL configured here

export interface User {
  id: string;
  username: string;
  email: string;
  phone?: string;
  display_name: string;
  avatar_url?: string;
  is_verified: boolean;
  created_at: number;
  last_login?: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: User;
  session_id: string;
}

export interface LoginCredentials {
  identifier: string;
  password: string;
  device_id?: string;
  device_name?: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  display_name?: string;
  phone?: string;
}

// Token storage keys
const ACCESS_TOKEN_KEY = 'pathmap_access_token';
const REFRESH_TOKEN_KEY = 'pathmap_refresh_token';
const USER_KEY = 'pathmap_user';

// Auth change callback type
type AuthChangeCallback = (authenticated: boolean, user: User | null) => void;

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private currentUser: User | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private authChangeListeners: Set<AuthChangeCallback> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthChange(callback: AuthChangeCallback): () => void {
    this.authChangeListeners.add(callback);
    // Immediately call with current state
    callback(this.isAuthenticated(), this.currentUser);
    // Return unsubscribe function
    return () => {
      this.authChangeListeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of auth state change
   */
  private notifyAuthChange(): void {
    const isAuth = this.isAuthenticated();
    const user = this.currentUser;
    this.authChangeListeners.forEach(cb => cb(isAuth, user));
  }

  /**
   * Load tokens from localStorage
   */
  private loadFromStorage(): void {
    try {
      this.accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      this.refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const userJson = localStorage.getItem(USER_KEY);
      if (userJson) {
        this.currentUser = JSON.parse(userJson);
      }
      
      // Schedule token refresh if logged in
      if (this.accessToken) {
        this.scheduleTokenRefresh();
      }
    } catch (e) {
      console.error('Failed to load auth from storage:', e);
    }
  }

  /**
   * Save tokens to localStorage
   */
  private saveToStorage(tokens: AuthTokens): void {
    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
      
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token;
      this.currentUser = tokens.user;
      
      this.scheduleTokenRefresh(tokens.expires_in);
      this.notifyAuthChange();
    } catch (e) {
      console.error('Failed to save auth to storage:', e);
    }
  }

  /**
   * Clear tokens from storage
   */
  private clearStorage(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
    
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
    
    this.notifyAuthChange();
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(expiresIn: number = 3600): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }
    
    // Refresh 5 minutes before expiry
    const refreshTime = (expiresIn - 300) * 1000;
    
    if (refreshTime > 0) {
      this.tokenRefreshTimer = setTimeout(() => {
        this.refreshAccessToken();
      }, refreshTime);
    }
  }

  /**
   * Register a new user
   */
  async register(data: RegisterData): Promise<AuthTokens> {
    const response = await fetch('/api/v1/social/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Registration failed');
    }

    const result = await response.json();
    this.saveToStorage(result.data);
    return result.data;
  }

  /**
   * Login with credentials
   */
  async login(credentials: LoginCredentials): Promise<AuthTokens> {
    const deviceId = this.getDeviceId();
    const deviceName = this.getDeviceName();

    const response = await fetch('/api/v1/social/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        device_id: credentials.device_id || deviceId,
        device_name: credentials.device_name || deviceName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Login failed');
    }

    const result = await response.json();
    this.saveToStorage(result.data);
    return result.data;
  }

  /**
   * Logout current session
   */
  async logout(): Promise<void> {
    try {
      await this.authenticatedFetch('/api/v1/social/auth/logout', {
        method: 'POST',
      });
    } catch (e) {
      // Ignore errors during logout
    }
    
    this.clearStorage();
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch('/api/v1/social/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!response.ok) {
        this.clearStorage();
        return false;
      }

      const result = await response.json();
      this.accessToken = result.data.access_token;
      localStorage.setItem(ACCESS_TOKEN_KEY, result.data.access_token);
      this.scheduleTokenRefresh(result.data.expires_in);
      
      return true;
    } catch (e) {
      this.clearStorage();
      return false;
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<User> {
    const response = await this.authenticatedFetch('/api/v1/social/auth/me');
    const result = await response.json();
    
    this.currentUser = result.data;
    localStorage.setItem(USER_KEY, JSON.stringify(result.data));
    
    return result.data;
  }

  /**
   * Update user profile
   */
  async updateProfile(updates: Partial<User>): Promise<void> {
    await this.authenticatedFetch('/api/v1/social/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    
    // Refresh profile
    await this.getProfile();
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const response = await this.authenticatedFetch('/api/v1/social/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to change password');
    }
  }

  /**
   * Make authenticated API request
   */
  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.accessToken}`);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle token expiration
    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers.set('Authorization', `Bearer ${this.accessToken}`);
        return fetch(url, { ...options, headers });
      }
      throw new Error('Session expired');
    }

    return response;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Get current user
   */
  getUser(): User | null {
    return this.currentUser;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Generate device ID
   */
  private getDeviceId(): string {
    let deviceId = localStorage.getItem('pathmap_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('pathmap_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Get device name from user agent
   */
  private getDeviceName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android Device';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Linux')) return 'Linux PC';
    return 'Unknown Device';
  }
}

// Export singleton instance
export const authService = new AuthService();
