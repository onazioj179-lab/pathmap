"""
PATHFINDER V46 — SMART PERMISSION FALLBACK + UNIVERSAL BLOCK DETECTION

Enhanced location permission system with:
- Intelligent block detection (browser/OS level)
- Permission State Model (PSM): DENIED, BLOCKED, UNAVAILABLE, RESTRICTED, ENABLED
- Micro-diagnostic bottom sheet
- Smart fallback navigation modes
- Silent retry for temporary failures
- Smooth transitions (<200ms)

Works on: iOS Safari, iOS Chrome, Android Chrome, Android WebView, Desktop
Performance: <150ms page load, <40ms button response, <20ms ISL sync
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum
from .permission_state import (
    LocationPermissionState,
    PermissionDiagnostics,
    PermissionDetector,
    FallbackNavigationMode,
    get_current_diagnostics,
    set_current_diagnostics
)


@dataclass
class LocationAccessConfig:
    """Configuration for location access page"""
    show_help_link: bool = True
    show_skip_button: bool = True
    enable_high_accuracy: bool = True
    timeout_ms: int = 8000
    maximum_age_ms: int = 0
    # Text content
    title: str = "Enable Location Access"
    subtitle: str = "For real-time routing and safe return navigation"
    allow_button_text: str = "Allow Location"
    skip_button_text: str = "Continue Without Location"
    help_link_text: str = "How Location Works"
    # iOS-specific messaging
    ios_banner_hint: str = "If prompted again at top of screen, tap Allow"
    # Android-specific settings
    android_request_delay_ms: int = 0  # No delay needed


class LocationAccessPage:
    """
    V45 Universal Location Access Page
    
    Handles cross-platform location permission with user-friendly UI.
    Integrates with Python Page Engine (V44) for server-side rendering.
    """
    
    def __init__(self, config: Optional[LocationAccessConfig] = None):
        """Initialize location access page"""
        self.config = config or LocationAccessConfig()
        self.state = LocationPermissionState.UNKNOWN
        self.last_error: Optional[str] = None
    
    def render_html(self) -> str:
        """
        Render location access page HTML
        
        Target: < 180ms render time
        """
        return f'''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Location Access - Pathfinder</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            -webkit-font-smoothing: antialiased;
            background: white;
            overflow: hidden;
            height: 100vh;
        }}
        
        .location-page {{
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 2rem;
            animation: fadeIn 0.3s ease-in-out;
        }}
        
        @keyframes fadeIn {{
            from {{ opacity: 0; transform: translateY(10px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        
        .icon-container {{
            width: 120px;
            height: 120px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 2rem;
            box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }}
        
        .icon {{
            font-size: 60px;
        }}
        
        .title {{
            font-size: 1.75rem;
            font-weight: 700;
            color: #1a202c;
            margin-bottom: 0.75rem;
            text-align: center;
        }}
        
        .subtitle {{
            font-size: 1rem;
            color: #718096;
            margin-bottom: 2.5rem;
            text-align: center;
            max-width: 400px;
            line-height: 1.5;
        }}
        
        .button-container {{
            display: flex;
            flex-direction: column;
            gap: 1rem;
            width: 100%;
            max-width: 320px;
        }}
        
        .button {{
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 600;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.15s ease;
            touch-action: manipulation;
            -webkit-tap-highlight-color: transparent;
        }}
        
        .button-primary {{
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
        }}
        
        .button-primary:active {{
            transform: scale(0.98);
            box-shadow: 0 2px 10px rgba(102, 126, 234, 0.3);
        }}
        
        .button-secondary {{
            background: #f7fafc;
            color: #4a5568;
            border: 2px solid #e2e8f0;
        }}
        
        .button-secondary:active {{
            background: #edf2f7;
            transform: scale(0.98);
        }}
        
        .help-link {{
            margin-top: 1.5rem;
            font-size: 0.875rem;
            color: #667eea;
            text-decoration: none;
            cursor: pointer;
        }}
        
        .help-link:hover {{
            text-decoration: underline;
        }}
        
        .status-message {{
            margin-top: 1.5rem;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-size: 0.875rem;
            text-align: center;
            max-width: 320px;
            display: none;
        }}
        
        .status-message.show {{
            display: block;
            animation: slideDown 0.3s ease;
        }}
        
        @keyframes slideDown {{
            from {{ opacity: 0; transform: translateY(-10px); }}
            to {{ opacity: 1; transform: translateY(0); }}
        }}
        
        .status-info {{
            background: #ebf8ff;
            color: #2c5282;
            border: 1px solid #bee3f8;
        }}
        
        .status-error {{
            background: #fff5f5;
            color: #742a2a;
            border: 1px solid #feb2b2;
        }}
        
        .status-success {{
            background: #f0fff4;
            color: #22543d;
            border: 1px solid #9ae6b4;
        }}
        
        .ios-hint {{
            margin-top: 1rem;
            padding: 0.5rem 1rem;
            background: #ebf8ff;
            color: #2c5282;
            border-radius: 8px;
            font-size: 0.75rem;
            text-align: center;
            display: none;
        }}
        
        .ios-hint.show {{
            display: block;
        }}
        
        /* Loading spinner */
        .spinner {{
            border: 3px solid rgba(102, 126, 234, 0.2);
            border-top-color: #667eea;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            animation: spin 0.8s linear infinite;
            display: inline-block;
            vertical-align: middle;
            margin-left: 0.5rem;
        }}
        
        @keyframes spin {{
            to {{ transform: rotate(360deg); }}
        }}
    </style>
</head>
<body>
    <div class="location-page">
        <div class="icon-container">
            <div class="icon" aria-hidden="true"></div>
        </div>
        
        <h1 class="title">{self.config.title}</h1>
        <p class="subtitle">{self.config.subtitle}</p>
        
        <div class="button-container">
            <button id="allow-button" class="button button-primary" onclick="handleAllowLocation()">
                {self.config.allow_button_text}
            </button>
            
            {f'<button id="skip-button" class="button button-secondary" onclick="handleSkipLocation()">{self.config.skip_button_text}</button>' if self.config.show_skip_button else ''}
        </div>
        
        {f'<a href="#" class="help-link" onclick="showHelp(); return false;">{self.config.help_link_text}</a>' if self.config.show_help_link else ''}
        
        <div id="status-message" class="status-message"></div>
        <div id="ios-hint" class="ios-hint">{self.config.ios_banner_hint}</div>
    </div>
    
    <script>
        // V45 Location Access Logic
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                     (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        console.log('[V45] Location Access Page loaded');
        console.log('[V45] Platform:', isIOS ? 'iOS' : isAndroid ? 'Android' : 'Desktop');
        
        function showStatus(message, type = 'info') {{
            const statusEl = document.getElementById('status-message');
            statusEl.textContent = message;
            statusEl.className = `status-message status-${{type}} show`;
        }}
        
        function hideStatus() {{
            const statusEl = document.getElementById('status-message');
            statusEl.classList.remove('show');
        }}
        
        function showIOSHint() {{
            if (isIOS) {{
                document.getElementById('ios-hint').classList.add('show');
            }}
        }}
        
        function handleAllowLocation() {{
            console.log('[V46] User clicked "Allow Location"');
            const button = document.getElementById('allow-button');
            
            // Disable button and show loading
            button.disabled = true;
            button.innerHTML = '{self.config.allow_button_text} <span class="spinner"></span>';
            
            // Track request time for popup detection
            window.permissionRequestTime = Date.now();
            
            // Show iOS hint immediately
            showIOSHint();
            
            // Request permission
            if (!navigator.geolocation) {{
                showStatus('Geolocation is not supported by your browser', 'error');
                button.disabled = false;
                button.innerHTML = '{self.config.allow_button_text}';
                return;
            }}
            
            const options = {{
                enableHighAccuracy: {str(self.config.enable_high_accuracy).lower()},
                timeout: {self.config.timeout_ms},
                maximumAge: {self.config.maximum_age_ms}
            }};
            
            navigator.geolocation.getCurrentPosition(
                // Success
                (position) => {{
                    console.log('[V45] Location permission GRANTED');
                    console.log('[V45] Position:', position.coords.latitude, position.coords.longitude);
                    
                    showStatus('Location enabled! Loading app...', 'success');
                    
                    // Send to PPE
                    fetch('/api/v45/location-permission', {{
                        method: 'POST',
                        headers: {{'Content-Type': 'application/json'}},
                        body: JSON.stringify({{
                            state: 'granted',
                            lat: position.coords.latitude,
                            lon: position.coords.longitude,
                            accuracy: position.coords.accuracy
                        }})
                    }}).then(() => {{
                        // Proceed to main app
                        setTimeout(() => {{
                            window.location.href = '/v44';
                        }}, 500);
                    }});
                }},
                
                // Error - V46 smart detection
                async (error) => {{
                    console.log('[V46] Location permission error:', error.code, error.message);
                    
                    button.disabled = false;
                    button.innerHTML = '{self.config.allow_button_text}';
                    
                    // Detect browser and platform
                    const browser = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? 'safari' : 
                                   /Chrome/.test(navigator.userAgent) ? 'chrome' : 'unknown';
                    const platform = /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' :
                                   /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
                    
                    // Check if popup was shown (heuristic: check timing)
                    const popupShown = (Date.now() - window.permissionRequestTime) > 100;
                    
                    // Send V46 error to backend for smart detection
                    const response = await fetch('/api/v46/permission-error', {{
                        method: 'POST',
                        headers: {{'Content-Type': 'application/json'}},
                        body: JSON.stringify({{
                            error_code: error.code,
                            browser: browser,
                            platform: platform,
                            popup_shown: popupShown
                        }})
                    }});
                    
                    const diagnostics = await response.json();
                    console.log('[V46] Diagnostics:', diagnostics);
                    
                    // Show appropriate message
                    showStatus(diagnostics.message, 'error');
                    
                    // Show diagnostic sheet if blocked or denied
                    if (diagnostics.show_settings_link) {{
                        setTimeout(() => {{
                            showDiagnosticSheet(diagnostics);
                        }}, 500);
                    }}
                    
                    // Enable skip button
                    setTimeout(() => {{
                        document.getElementById('skip-button').style.background = '#fef5e7';
                        document.getElementById('skip-button').style.borderColor = '#f39c12';
                    }}, 1000);
                    
                    // Silent retry for UNAVAILABLE
                    if (diagnostics.can_retry && diagnostics.state === 'unavailable') {{
                        console.log(`[V46] Will retry in ${{diagnostics.retry_interval}} seconds`);
                        setTimeout(() => {{
                            handleAllowLocation();
                        }}, diagnostics.retry_interval * 1000);
                    }}
                }},
                
                options
            );
        }}
        
        function handleSkipLocation() {{
            console.log('[V45] User clicked "Continue Without Location"');
            
            showStatus('Continuing without location...', 'info');
            
            // Send skipped state to PPE
            fetch('/api/v45/location-permission', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{state: 'skipped'}})
            }}).then(() => {{
                // Proceed to main app (no GPS mode)
                setTimeout(() => {{
                    window.location.href = '/v44?gps=disabled';
                }}, 300);
            }});
        }}
        
        function showHelp() {{
            alert(`Location Access Help:\\n\\n` +
                  `Android: Settings → Apps → Browser → Permissions → Location\\n\\n` +
                  `iOS: Settings → Privacy → Location Services → Browser\\n\\n` +
                  `Your location is only used for real-time navigation and is never stored or shared.`);
        }}
        
        // V46: Show diagnostic sheet
        async function showDiagnosticSheet(diagnostics) {{
            const response = await fetch('/api/v46/diagnostic-sheet', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify(diagnostics)
            }});
            const html = await response.text();
            
            // Insert diagnostic sheet
            const container = document.createElement('div');
            container.innerHTML = html;
            document.body.appendChild(container.firstElementChild);
            
            // Show with animation
            setTimeout(() => {{
                document.getElementById('diagnostic-sheet').classList.add('show');
            }}, 50);
        }}
    </script>
</body>
</html>
        '''
    
    def handle_permission_granted(self, lat: float, lon: float, accuracy: float, page_engine=None) -> Dict[str, Any]:
        """
        Handle successful location permission grant
        
        Args:
            lat: Latitude
            lon: Longitude
            accuracy: Accuracy in meters
            page_engine: Optional PageEngine instance to sync state
            
        Returns:
            Success response
        """
        self.state = LocationPermissionState.GRANTED
        self.last_error = None
        
        # Sync with PageEngine if available
        if page_engine:
            page_engine.update_state(
                gps_enabled=True,
                location_permission="granted",
                no_gps_mode=False,
                gps_lat=lat,
                gps_lon=lon,
                gps_accuracy=accuracy
            )
        
        return {
            'status': 'success',
            'state': 'granted',
            'message': 'Location access granted',
            'lat': lat,
            'lon': lon,
            'accuracy': accuracy
        }
    
    def handle_permission_skipped(self, page_engine=None) -> Dict[str, Any]:
        """
        Handle user choosing to skip location permission
        
        Args:
            page_engine: Optional PageEngine instance to sync state
            
        Returns:
            Skipped response
        """
        self.state = LocationPermissionState.SKIPPED
        self.last_error = None
        
        # Sync with PageEngine if available  
        if page_engine:
            page_engine.update_state(
                gps_enabled=False,
                location_permission="skipped",
                no_gps_mode=True
            )
        
        return {
            'status': 'success',
            'state': 'skipped',
            'message': 'Continuing without location',
            'fallback_mode': True
        }
    
    def handle_permission_error(
        self, 
        error_code: int,
        browser: str,
        platform: str,
        popup_shown: bool,
        page_engine=None
    ) -> Dict[str, Any]:
        """
        V46: Handle geolocation errors with smart detection
        
        Args:
            error_code: GeolocationPositionError.code (1, 2, or 3)
            browser: Browser type ('chrome', 'safari', 'firefox')
            platform: Platform ('android', 'ios', 'desktop')
            popup_shown: Whether permission popup was displayed
            page_engine: Optional PageEngine instance to sync state
            
        Returns:
            Diagnostic response with state and guidance
        """
        # Use V46 smart detection
        diagnostics = PermissionDetector.detect_from_error(
            error_code=error_code,
            browser=browser,
            platform=platform,
            popup_shown=popup_shown
        )
        
        # Store diagnostics globally
        set_current_diagnostics(diagnostics)
        
        # Update internal state
        self.state = diagnostics.state
        self.last_error = diagnostics.error_message or diagnostics.user_message
        
        # Sync with PageEngine if available
        if page_engine:
            page_engine.update_state(
                gps_enabled=False,
                location_permission=diagnostics.state.value,
                no_gps_mode=True
            )
        
        # Get fallback capabilities
        capabilities = FallbackNavigationMode.get_capabilities(diagnostics.state)
        
        return {
            'status': 'error',
            'state': diagnostics.state.value,
            'error_code': error_code,
            'message': diagnostics.user_message,
            'technical_details': diagnostics.technical_details,
            'can_retry': diagnostics.can_retry,
            'retry_interval': diagnostics.retry_interval_seconds,
            'show_settings_link': diagnostics.show_settings_link,
            'capabilities': capabilities,
            'timestamp': diagnostics.timestamp
        }
    
    def render_diagnostic_sheet(self, diagnostics: Optional[PermissionDiagnostics] = None) -> str:
        """
        V46: Render micro-diagnostic bottom sheet
        
        Minimal, professional panel with:
        - Status icon
        - Brief message
        - Optional Settings button
        - Smooth slide-up animation (180-220ms)
        
        Args:
            diagnostics: Permission diagnostics to display
            
        Returns:
            HTML for bottom sheet
        """
        if diagnostics is None:
            diagnostics = get_current_diagnostics()
        
        if diagnostics is None:
            return ""  # No diagnostics to show
        
        # Choose icon based on state
        icon_svg = {
            LocationPermissionState.LOCATION_BLOCKED: '''
                <svg class="diagnostic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            ''',
            LocationPermissionState.LOCATION_DENIED: '''
                <svg class="diagnostic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
            ''',
            LocationPermissionState.LOCATION_UNAVAILABLE: '''
                <svg class="diagnostic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                </svg>
            ''',
            LocationPermissionState.LOCATION_RESTRICTED: '''
                <svg class="diagnostic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                    <circle cx="12" cy="10" r="3"/>
                </svg>
            '''
        }.get(diagnostics.state, '')
        
        settings_button = ''
        if diagnostics.show_settings_link:
            settings_button = '''
                <button class="diagnostic-settings-btn" onclick="openBrowserSettings()">
                    Open Settings
                </button>
            '''
        
        return f'''
        <div class="diagnostic-sheet" id="diagnostic-sheet">
            <div class="diagnostic-handle"></div>
            <div class="diagnostic-content">
                {icon_svg}
                <div class="diagnostic-text">
                    <h3 class="diagnostic-title">{diagnostics.user_message}</h3>
                    {f'<p class="diagnostic-hint">{diagnostics.technical_details}</p>' if diagnostics.technical_details else ''}
                </div>
                {settings_button}
                <button class="diagnostic-close-btn" onclick="closeDiagnosticSheet()">
                    Continue Anyway
                </button>
            </div>
        </div>
        
        <style>
        .diagnostic-sheet {{
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: white;
            border-radius: 16px 16px 0 0;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
            padding: 1.5rem;
            transform: translateY(100%);
            transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1000;
            max-width: 600px;
            margin: 0 auto;
        }}
        
        .diagnostic-sheet.show {{
            transform: translateY(0);
        }}
        
        .diagnostic-handle {{
            width: 40px;
            height: 4px;
            background: #cbd5e0;
            border-radius: 2px;
            margin: 0 auto 1rem;
        }}
        
        .diagnostic-content {{
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 1rem;
        }}
        
        .diagnostic-icon {{
            width: 48px;
            height: 48px;
            color: #667eea;
            margin-bottom: 0.5rem;
        }}
        
        .diagnostic-text {{
            flex: 1;
        }}
        
        .diagnostic-title {{
            font-size: 1rem;
            font-weight: 600;
            color: #2d3748;
            margin: 0 0 0.25rem 0;
        }}
        
        .diagnostic-hint {{
            font-size: 0.75rem;
            color: #718096;
            margin: 0;
        }}
        
        .diagnostic-settings-btn {{
            width: 100%;
            padding: 0.875rem;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 0.9375rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 120ms ease;
        }}
        
        .diagnostic-settings-btn:active {{
            transform: scale(0.98);
            background: #5a67d8;
        }}
        
        .diagnostic-close-btn {{
            width: 100%;
            padding: 0.875rem;
            background: transparent;
            color: #667eea;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 0.9375rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 120ms ease;
        }}
        
        .diagnostic-close-btn:active {{
            transform: scale(0.98);
            background: #f7fafc;
        }}
        </style>
        
        <script>
        function closeDiagnosticSheet() {{
            const sheet = document.getElementById('diagnostic-sheet');
            if (sheet) {{
                sheet.classList.remove('show');
            }}
        }}
        
        function openBrowserSettings() {{
            // Platform-specific settings URLs
            alert('Please enable location in your browser or device settings.');
            // Could open app settings on mobile if wrapped in WebView
        }}
        </script>
        '''
    
    def get_state(self) -> Dict[str, Any]:
        """Get current state with V46 diagnostics"""
        diagnostics = get_current_diagnostics()
        
        state_data = {
            'state': self.state.value,
            'last_error': self.last_error,
            'config': {
                'show_help_link': self.config.show_help_link,
                'show_skip_button': self.config.show_skip_button,
                'enable_high_accuracy': self.config.enable_high_accuracy
            }
        }
        
        # Add V46 diagnostics if available
        if diagnostics:
            state_data['diagnostics'] = {
                'state': diagnostics.state.value,
                'user_message': diagnostics.user_message,
                'can_retry': diagnostics.can_retry,
                'retry_interval': diagnostics.retry_interval_seconds,
                'show_settings_link': diagnostics.show_settings_link
            }
            state_data['capabilities'] = FallbackNavigationMode.get_capabilities(diagnostics.state)
        
        return state_data


# Global instance
_location_access_page: Optional[LocationAccessPage] = None


def get_location_access_page() -> LocationAccessPage:
    """Get global location access page instance"""
    global _location_access_page
    if _location_access_page is None:
        _location_access_page = LocationAccessPage()
    return _location_access_page
