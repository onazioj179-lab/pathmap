export type NavigationAction = 'route' | 'safe-return' | 'explore' | 'track-start' | 'track-stop';
export type ActionStatus = 'idle' | 'processing' | 'success' | 'error';

interface ActionResult {
  success: boolean;
  message?: string;
  data?: any;
}

interface ActionState {
  current: NavigationAction | null;
  status: ActionStatus;
  startTime: number | null;
}

export class ActionEngine {
  private baseUrl: string;
  private state: ActionState = {
    current: null,
    status: 'idle',
    startTime: null
  };
  private listeners: Set<(state: ActionState) => void> = new Set();

  constructor(backendUrl: string = 'http://localhost:8000') {
    this.baseUrl = backendUrl;
  }

  private setState(updates: Partial<ActionState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state));
  }

  subscribe(listener: (state: ActionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  isLocked(): boolean {
    return this.state.status === 'processing';
  }

  async executeAction(action: NavigationAction, params?: any): Promise<ActionResult> {
    if (this.isLocked()) {
      return {
        success: false,
        message: 'Another action is in progress'
      };
    }

    this.setState({
      current: action,
      status: 'processing',
      startTime: Date.now()
    });

    try {
      const result = await this.performAction(action, params);
      
      this.setState({
        status: result.success ? 'success' : 'error',
        startTime: null
      });

      setTimeout(() => {
        if (this.state.current === action) {
          this.setState({ current: null, status: 'idle' });
        }
      }, 1000);

      return result;

    } catch (error) {
      this.setState({
        status: 'error',
        current: null,
        startTime: null
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Action failed'
      };
    }
  }

  private async performAction(action: NavigationAction, params?: any): Promise<ActionResult> {
    const endpoints: Record<NavigationAction, string> = {
      'route': '/api/action/route',
      'safe-return': '/api/action/safe-return',
      'explore': '/api/action/explore',
      'track-start': '/api/action/track/start',
      'track-stop': '/api/action/track/stop'
    };

    const endpoint = endpoints[action];
    if (!endpoint) {
      throw new Error(`Unknown action: ${action}`);
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params || {})
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      data
    };
  }

  getState(): ActionState {
    return { ...this.state };
  }

  async cancelCurrentAction(): Promise<void> {
    if (!this.state.current) return;

    this.setState({
      current: null,
      status: 'idle',
      startTime: null
    });
  }
}
