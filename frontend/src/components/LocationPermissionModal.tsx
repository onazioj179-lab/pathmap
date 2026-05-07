/**
 * PATHFINDER V39 — PERMISSION REQUEST COMPONENT
 *
 * Modal UI for requesting device location permission with clear messaging.
 */

import React, { useEffect, useState } from 'react';
import { MapPin, AlertCircle, CheckCircle } from 'lucide-react';
import { deviceLocationService, LocationPermissionStatus } from '../services/deviceLocationService';
import { Button } from './Button';

interface LocationPermissionModalProps {
  onPermissionGranted: () => void;
  onPermissionDenied: () => void;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  onPermissionGranted,
  onPermissionDenied,
}) => {
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionStatus | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [showModal, setShowModal] = useState(true);

  useEffect(() => {
    // Check initial permission status
    const status = deviceLocationService.getPermissionStatus();
    setPermissionStatus(status);

    // Subscribe to permission changes
    const unsubscribe = deviceLocationService.addPermissionListener(status => {
      setPermissionStatus(status);

      if (status.granted) {
        setShowModal(false);
        onPermissionGranted();
      } else if (status.denied) {
        onPermissionDenied();
      }
    });

    return () => unsubscribe();
  }, [onPermissionGranted, onPermissionDenied]);

  const handleRequestPermission = async () => {
    console.log('[PermissionModal] User clicked Allow Location Access');

    // Detect browser for troubleshooting
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isSafari || isIOS) {
      console.log(
        '[PermissionModal] Running on Safari/iOS - watch for browser popup at top of screen'
      );
    }

    setIsRequesting(true);
    try {
      console.log('[PermissionModal] Calling deviceLocationService.requestPermission()...');
      const result = await deviceLocationService.requestPermission();
      console.log('[PermissionModal] Permission result:', result);

      if (result.denied) {
        console.warn('[PermissionModal] Permission was denied by user or browser');
      } else if (result.granted) {
        console.log('[PermissionModal] Permission granted successfully!');
      }
    } catch (error) {
      console.error('[PermissionModal] Permission request failed:', error);
      alert('Location request failed. Please check browser console for details.');
    } finally {
      setIsRequesting(false);
    }
  };

  // Don't show modal if permission already granted
  if (permissionStatus?.granted || !showModal) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
          Enable Location Access
        </h2>

        {/* Description */}
        <p className="text-center text-gray-600 mb-4">
          PathFinder needs your location to provide real-time navigation, safety monitoring, and
          environmental awareness.
        </p>

        {/* Safari/iOS specific instruction */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-blue-800 text-center">
            <strong>Safari/iOS users:</strong> After clicking "Allow", you must tap "Allow" in the
            browser popup that appears at the top of your screen.
          </p>
        </div>

        {/* Permission Status */}
        {permissionStatus?.denied && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900 mb-1">Location Permission Denied</p>
              <p className="text-xs text-red-700 mb-2">
                Please enable location access in your browser settings.
              </p>
              <details className="text-xs text-red-700">
                <summary className="cursor-pointer font-semibold mb-1">
                  Safari/iOS Instructions
                </summary>
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li>Open Settings → Safari → Location</li>
                  <li>Select "Ask" or "Allow"</li>
                  <li>Return to PathFinder and refresh</li>
                </ol>
              </details>
            </div>
          </div>
        )}

        {/* Features List */}
        <div className="space-y-3 mb-6">
          <Feature text="Real-time navigation and routing" />
          <Feature text="Live safety monitoring and alerts" />
          <Feature text="Environmental condition tracking" />
          <Feature text="Accurate ETA and distance calculations" />
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Button
            onClick={handleRequestPermission}
            loading={isRequesting}
            fullWidth
            variant="primary"
            size="lg"
            className="touch-manipulation"
          >
            {isRequesting ? (
              'Requesting...'
            ) : (
              <>
                <MapPin className="w-5 h-5" />
                Allow Location Access
              </>
            )}
          </Button>

          {permissionStatus?.denied && (
            <Button
              onClick={() => {
                window.open('https://support.google.com/chrome/answer/142065', '_blank');
              }}
              fullWidth
              variant="secondary"
              size="md"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700"
            >
              How to Enable Location
            </Button>
          )}
        </div>

        {/* Privacy Note */}
        <p className="text-xs text-gray-500 text-center mt-6">
          Your location data is only used for navigation and is never shared with third parties.
        </p>
      </div>
    </div>
  );
};

// =====================================================================
// FEATURE ITEM COMPONENT
// =====================================================================

const Feature: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-3">
    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
    <span className="text-sm text-gray-700">{text}</span>
  </div>
);
