/**
 * PATHFINDER V54 — TRUST LOCATION MODAL
 * =====================================
 * 
 * Philosophy:
 *   Minimalist, clean, trust-first design.
 *   No forced blocking, no long hints, no warnings.
 *   Two buttons only: Allow or Skip.
 *   
 * Features:
 *   - Clean outline design
 *   - Professional SVG icon
 *   - 1-line description
 *   - Two clear action buttons
 *   - No toggle switches
 *   - No Safari-specific warnings
 *   - Instant dismissal
 */

export interface TrustLocationModalProps {
  onAllow: () => void;
  onSkip: () => void;
  visible: boolean;
}

export class TrustLocationModal {
  private container: HTMLElement | null = null;
  private onAllow: (() => void) | null = null;
  private onSkip: (() => void) | null = null;
  
  /**
   * Show the trust location modal
   */
  show(props: TrustLocationModalProps): void {
    this.onAllow = props.onAllow;
    this.onSkip = props.onSkip;
    
    if (!props.visible) {
      this.hide();
      return;
    }
    
    // Remove existing modal
    this.hide();
    
    // Create modal container
    this.container = document.createElement('div');
    this.container.className = 'trust-location-modal-overlay';
    this.container.innerHTML = this.renderModal();
    
    // Add to DOM
    document.body.appendChild(this.container);
    
    // Attach event listeners
    this.attachEventListeners();
    
    // Animate in
    requestAnimationFrame(() => {
      if (this.container) {
        this.container.style.opacity = '1';
      }
    });
  }
  
  /**
   * Hide the modal
   */
  hide(): void {
    if (this.container) {
      this.container.style.opacity = '0';
      setTimeout(() => {
        if (this.container && this.container.parentNode) {
          this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
      }, 200);
    }
  }
  
  /**
   * Render modal HTML
   */
  private renderModal(): string {
    return `
      <div class="trust-location-modal">
        <div class="trust-location-icon">
          ${this.renderLocationIcon()}
        </div>
        
        <h2 class="trust-location-title">Enable Location</h2>
        
        <p class="trust-location-description">
          Get real-time navigation and accurate routing
        </p>
        
        <div class="trust-location-buttons">
          <button class="trust-location-btn trust-location-btn-primary" data-action="allow">
            Allow Location
          </button>
          
          <button class="trust-location-btn trust-location-btn-secondary" data-action="skip">
            Enter Without Location
          </button>
        </div>
      </div>
    `;
  }
  
  /**
   * Render location SVG icon
   */
  private renderLocationIcon(): string {
    return `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
        <circle cx="12" cy="12" r="3" fill="currentColor"/>
        <path d="M12 2V6M12 18V22M2 12H6M18 12H22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `;
  }
  
  /**
   * Attach event listeners to buttons
   */
  private attachEventListeners(): void {
    if (!this.container) return;
    
    const allowBtn = this.container.querySelector('[data-action="allow"]');
    const skipBtn = this.container.querySelector('[data-action="skip"]');
    
    if (allowBtn) {
      allowBtn.addEventListener('click', () => {
        if (this.onAllow) {
          this.onAllow();
        }
        this.hide();
      });
    }
    
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        if (this.onSkip) {
          this.onSkip();
        }
        this.hide();
      });
    }
  }
}

/**
 * Inject modal styles into document
 */
export function injectTrustLocationModalStyles(): void {
  if (document.getElementById('trust-location-modal-styles')) {
    return; // Already injected
  }
  
  const styleElement = document.createElement('style');
  styleElement.id = 'trust-location-modal-styles';
  styleElement.textContent = `
    .trust-location-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    
    .trust-location-modal {
      background: white;
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      text-align: center;
      animation: slideUp 0.3s ease;
    }
    
    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    .trust-location-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      color: white;
    }
    
    .trust-location-title {
      font-size: 24px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 12px 0;
    }
    
    .trust-location-description {
      font-size: 15px;
      color: #666;
      margin: 0 0 28px 0;
      line-height: 1.5;
    }
    
    .trust-location-buttons {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .trust-location-btn {
      padding: 14px 24px;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      width: 100%;
    }
    
    .trust-location-btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .trust-location-btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
    }
    
    .trust-location-btn-secondary {
      background: #f5f5f5;
      color: #666;
    }
    
    .trust-location-btn-secondary:hover {
      background: #e8e8e8;
    }
    
    .trust-location-btn:active {
      transform: translateY(0);
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .trust-location-modal {
        background: #1a1a1a;
      }
      
      .trust-location-title {
        color: white;
      }
      
      .trust-location-description {
        color: #999;
      }
      
      .trust-location-btn-secondary {
        background: #2a2a2a;
        color: #ccc;
      }
      
      .trust-location-btn-secondary:hover {
        background: #333;
      }
    }
    
    /* Mobile responsive */
    @media (max-width: 480px) {
      .trust-location-modal {
        padding: 24px;
      }
      
      .trust-location-icon {
        width: 64px;
        height: 64px;
      }
      
      .trust-location-icon svg {
        width: 32px;
        height: 32px;
      }
      
      .trust-location-title {
        font-size: 20px;
      }
      
      .trust-location-description {
        font-size: 14px;
      }
      
      .trust-location-btn {
        padding: 12px 20px;
        font-size: 15px;
      }
    }
  `;
  
  document.head.appendChild(styleElement);
}

/**
 * Create and show trust location modal
 */
export function showTrustLocationModal(
  onAllow: () => void,
  onSkip: () => void
): TrustLocationModal {
  injectTrustLocationModalStyles();
  
  const modal = new TrustLocationModal();
  modal.show({
    onAllow,
    onSkip,
    visible: true
  });
  
  return modal;
}
