"""
V27.1: Context-Aware Navigation Intelligence Engine

Monitors real-world conditions and automatically adapts routing strategy:
- GPS accuracy
- Battery level
- Signal strength
- Time of day
- User speed & behavior
- Area familiarity
- Friend proximity
- Safety conditions
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from enum import Enum


class ContextFlag(Enum):
    """Flags for different context conditions"""
    # Device flags
    LOW_BATTERY = "low_battery"
    WEAK_GPS = "weak_gps"
    WEAK_SIGNAL = "weak_signal"
    GOOD_CONDITIONS = "good_conditions"
    
    # Environment flags
    NIGHTTIME = "nighttime"
    DAYTIME = "daytime"
    DAWN_DUSK = "dawn_dusk"
    
    # Safety flags
    UNSAFE_ZONE = "unsafe_zone"
    UNKNOWN_ZONE = "unknown_zone"
    SAFE_ZONE = "safe_zone"
    HIGH_DEVIATION = "high_deviation"
    
    # Exploration flags
    EXPLORING = "exploring"
    COMMUTING = "commuting"
    FRIEND_NEARBY = "friend_nearby"
    STATIONARY = "stationary"


class AlgoRecommendation(Enum):
    """Algorithm recommendations with reasoning"""
    SHADOW_PATH = "ShadowPath"
    HOME_GUARD = "HomeGuard"
    PATHFINDER_X = "PathfinderX"


class ContextState:
    """Current context state snapshot"""
    
    def __init__(self):
        self.timestamp = datetime.now()
        
        # Device state
        self.battery_percent: float = 100.0
        self.gps_accuracy_m: float = 5.0
        self.signal_strength: int = 5  # 0-5 bars
        
        # User state
        self.user_speed_mps: float = 1.4  # meters per second
        self.current_position: Optional[Tuple[float, float]] = None
        self.is_moving: bool = False
        
        # Environment state
        self.time_of_day: str = "day"  # day/night/dawn/dusk
        self.current_hour: int = 12
        
        # Area state
        self.familiarity_score: float = 0.5  # 0-1, higher = more familiar
        self.safety_score: float = 75.0  # 0-100
        
        # Friend state
        self.friend_distance_m: Optional[float] = None
        self.friend_active: bool = False
        
        # Behavior state
        self.route_deviation_count: int = 0
        self.exploration_score: float = 0.0  # Higher = more wandering
        self.recent_algo_success: Dict[str, float] = {
            "ShadowPath": 1.0,
            "HomeGuard": 1.0,
            "PathfinderX": 1.0
        }


class ContextEngine:
    """
    Context-Aware Navigation Intelligence Engine
    
    Analyzes real-world conditions and provides intelligent routing recommendations.
    """
    
    def __init__(self):
        self.state = ContextState()
        self.evaluation_interval_s = 5  # Default evaluation frequency
        self.last_recommendation: Optional[str] = None
        
        # Thresholds for decision making
        self.thresholds = {
            "low_battery": 20.0,  # percent
            "weak_gps": 20.0,  # meters
            "weak_signal": 2,  # bars
            "night_start": 20,  # hour (8 PM)
            "night_end": 6,  # hour (6 AM)
            "high_deviation": 3,  # count
            "slow_speed": 0.5,  # m/s
            "fast_speed": 2.0,  # m/s
            "unfamiliar": 0.3,  # familiarity score
            "unsafe": 50.0,  # safety score
            "friend_nearby": 500.0,  # meters
        }
    
    def update_state(self, user_state: Dict[str, Any], 
                    environment: Dict[str, Any],
                    device: Dict[str, Any]) -> None:
        """
        Update context state with new data.
        
        Args:
            user_state: {position, speed, is_moving, deviation_count}
            environment: {time_of_day, hour, familiarity, safety_score}
            device: {battery, gps_accuracy, signal_strength}
        """
        # Device
        self.state.battery_percent = device.get("battery_percent", 100.0)
        self.state.gps_accuracy_m = device.get("gps_accuracy_m", 5.0)
        self.state.signal_strength = device.get("signal_strength", 5)
        
        # User
        self.state.user_speed_mps = user_state.get("speed_mps", 1.4)
        self.state.current_position = user_state.get("position")
        self.state.is_moving = user_state.get("is_moving", False)
        self.state.route_deviation_count = user_state.get("deviation_count", 0)
        
        # Environment
        self.state.current_hour = environment.get("hour", 12)
        self.state.time_of_day = self._classify_time_of_day(self.state.current_hour)
        self.state.familiarity_score = environment.get("familiarity_score", 0.5)
        self.state.safety_score = environment.get("safety_score", 75.0)
        
        # Friend
        friend_data = user_state.get("friend", {})
        self.state.friend_distance_m = friend_data.get("distance_m")
        self.state.friend_active = friend_data.get("active", False)
        
        # Update exploration score based on speed and deviation
        self.state.exploration_score = self._calculate_exploration_score()
        
        # Adjust evaluation interval based on battery
        self._adjust_evaluation_interval()
    
    def _classify_time_of_day(self, hour: int) -> str:
        """Classify time into day/night/dawn/dusk"""
        if 6 <= hour < 8 or 18 <= hour < 20:
            return "dawn_dusk"
        elif 8 <= hour < 18:
            return "day"
        else:
            return "night"
    
    def _calculate_exploration_score(self) -> float:
        """
        Calculate how much user is exploring vs. commuting.
        
        Score ranges:
        - 0.0-0.3: Commuting (direct movement)
        - 0.4-0.6: Mixed behavior
        - 0.7-1.0: Exploring (wandering, slow, deviations)
        """
        score = 0.0
        
        # Slow movement suggests exploration
        if self.state.user_speed_mps < self.thresholds["slow_speed"]:
            score += 0.3
        
        # Deviations suggest exploration
        if self.state.route_deviation_count >= self.thresholds["high_deviation"]:
            score += 0.3
        
        # Low familiarity + moving = likely exploring
        if self.state.familiarity_score < self.thresholds["unfamiliar"] and self.state.is_moving:
            score += 0.4
        
        return min(score, 1.0)
    
    def _adjust_evaluation_interval(self) -> None:
        """Adjust how often we evaluate context based on battery"""
        if self.state.battery_percent < self.thresholds["low_battery"]:
            self.evaluation_interval_s = 8  # Slower updates to save power
        elif self.state.battery_percent < 50:
            self.evaluation_interval_s = 5
        else:
            self.evaluation_interval_s = 3  # Fast updates when battery is good
    
    def analyze_context(self) -> Dict[str, Any]:
        """
        Analyze current context and generate recommendation.
        
        Returns:
            {
                "recommended_algo": "ShadowPath" | "HomeGuard" | "PathfinderX",
                "confidence": 0.0-1.0,
                "context_actions": [action strings],
                "safety_adjustments": {...},
                "ui_signals": [UI message strings],
                "flags": {
                    "device": [...],
                    "environment": [...],
                    "safety": [...],
                    "exploration": [...]
                },
                "notes": "Reasoning for decision"
            }
        """
        # Collect flags
        flags = self._collect_flags()
        
        # Determine recommended algorithm
        algo, confidence, reasoning = self._recommend_algorithm(flags)
        
        # Generate context-aware actions
        actions = self._generate_actions(flags, algo)
        
        # Calculate safety adjustments
        safety_adjustments = self._calculate_safety_adjustments(flags)
        
        # Generate UI signals
        ui_signals = self._generate_ui_signals(flags, algo)
        
        self.last_recommendation = algo.value
        
        return {
            "recommended_algo": algo.value,
            "confidence": confidence,
            "context_actions": actions,
            "safety_adjustments": safety_adjustments,
            "ui_signals": ui_signals,
            "flags": {
                "device": flags["device"],
                "environment": flags["environment"],
                "safety": flags["safety"],
                "exploration": flags["exploration"]
            },
            "notes": reasoning,
            "evaluation_interval_s": self.evaluation_interval_s
        }
    
    def _collect_flags(self) -> Dict[str, List[str]]:
        """Collect all relevant context flags"""
        flags = {
            "device": [],
            "environment": [],
            "safety": [],
            "exploration": []
        }
        
        # Device flags
        if self.state.battery_percent < self.thresholds["low_battery"]:
            flags["device"].append(ContextFlag.LOW_BATTERY.value)
        if self.state.gps_accuracy_m > self.thresholds["weak_gps"]:
            flags["device"].append(ContextFlag.WEAK_GPS.value)
        if self.state.signal_strength <= self.thresholds["weak_signal"]:
            flags["device"].append(ContextFlag.WEAK_SIGNAL.value)
        if not flags["device"]:
            flags["device"].append(ContextFlag.GOOD_CONDITIONS.value)
        
        # Environment flags
        flags["environment"].append(self.state.time_of_day)
        
        # Safety flags
        if self.state.safety_score < self.thresholds["unsafe"]:
            flags["safety"].append(ContextFlag.UNSAFE_ZONE.value)
        elif self.state.familiarity_score < self.thresholds["unfamiliar"]:
            flags["safety"].append(ContextFlag.UNKNOWN_ZONE.value)
        else:
            flags["safety"].append(ContextFlag.SAFE_ZONE.value)
        
        if self.state.route_deviation_count >= self.thresholds["high_deviation"]:
            flags["safety"].append(ContextFlag.HIGH_DEVIATION.value)
        
        # Exploration flags
        if self.state.exploration_score > 0.7:
            flags["exploration"].append(ContextFlag.EXPLORING.value)
        elif self.state.exploration_score < 0.3:
            flags["exploration"].append(ContextFlag.COMMUTING.value)
        
        if self.state.friend_active and self.state.friend_distance_m is not None:
            if self.state.friend_distance_m < self.thresholds["friend_nearby"]:
                flags["exploration"].append(ContextFlag.FRIEND_NEARBY.value)
        
        if not self.state.is_moving:
            flags["exploration"].append(ContextFlag.STATIONARY.value)
        
        return flags
    
    def _recommend_algorithm(self, flags: Dict[str, List[str]]) -> Tuple[AlgoRecommendation, float, str]:
        """
        Recommend best algorithm based on context flags.
        
        Returns:
            (algorithm, confidence 0-1, reasoning string)
        """
        device_flags = flags["device"]
        env_flags = flags["environment"]
        safety_flags = flags["safety"]
        explore_flags = flags["exploration"]
        
        # High priority: Safety concerns → HomeGuard
        if (ContextFlag.LOW_BATTERY.value in device_flags or
            ContextFlag.WEAK_GPS.value in device_flags or
            ContextFlag.UNSAFE_ZONE.value in safety_flags or
            ContextFlag.UNKNOWN_ZONE.value in safety_flags or
            "night" in env_flags or
            ContextFlag.HIGH_DEVIATION.value in safety_flags):
            
            reasoning = "Safety prioritized: "
            if ContextFlag.LOW_BATTERY.value in device_flags:
                reasoning += "low battery detected, "
            if ContextFlag.WEAK_GPS.value in device_flags:
                reasoning += "weak GPS accuracy, "
            if ContextFlag.UNSAFE_ZONE.value in safety_flags:
                reasoning += "unsafe zone detected, "
            if ContextFlag.UNKNOWN_ZONE.value in safety_flags:
                reasoning += "entering unfamiliar area, "
            if "night" in env_flags:
                reasoning += "nighttime conditions, "
            if ContextFlag.HIGH_DEVIATION.value in safety_flags:
                reasoning += "route deviations detected, "
            
            reasoning += "→ HomeGuard (safe return, stable breadcrumbs)"
            return AlgoRecommendation.HOME_GUARD, 0.9, reasoning
        
        # Medium priority: Friend nearby → ShadowPath
        if ContextFlag.FRIEND_NEARBY.value in explore_flags:
            reasoning = "Friend detected nearby → ShadowPath (fastest meeting point)"
            return AlgoRecommendation.SHADOW_PATH, 0.85, reasoning
        
        # Medium priority: Exploring behavior → PathfinderX
        if ContextFlag.EXPLORING.value in explore_flags:
            reasoning = "Exploration behavior detected (slow speed, deviations) → PathfinderX (discovery mode)"
            return AlgoRecommendation.PATHFINDER_X, 0.8, reasoning
        
        # Default: Good conditions + commuting → ShadowPath
        if ContextFlag.GOOD_CONDITIONS.value in device_flags and ContextFlag.COMMUTING.value in explore_flags:
            reasoning = "Good device conditions + direct movement → ShadowPath (optimal speed)"
            return AlgoRecommendation.SHADOW_PATH, 0.85, reasoning
        
        # Fallback: Safe and reliable
        reasoning = "Neutral conditions → ShadowPath (balanced routing)"
        return AlgoRecommendation.SHADOW_PATH, 0.7, reasoning
    
    def _generate_actions(self, flags: Dict[str, List[str]], algo: AlgoRecommendation) -> List[str]:
        """Generate recommended actions based on context"""
        actions = []
        
        # Auto-enable breadcrumb tracking
        if (ContextFlag.UNKNOWN_ZONE.value in flags["safety"] or
            ContextFlag.UNSAFE_ZONE.value in flags["safety"] or
            "night" in flags["environment"]):
            actions.append("enable_breadcrumb_tracking")
        
        # Increase safety score weighting
        if "night" in flags["environment"] or ContextFlag.UNSAFE_ZONE.value in flags["safety"]:
            actions.append("increase_safety_weighting")
        
        # Suggest safe return
        if ContextFlag.HIGH_DEVIATION.value in flags["safety"]:
            actions.append("suggest_safe_return")
        
        # Optimize for battery
        if ContextFlag.LOW_BATTERY.value in flags["device"]:
            actions.append("reduce_update_frequency")
            actions.append("enable_power_save_mode")
        
        # Enable exploration features
        if ContextFlag.EXPLORING.value in flags["exploration"]:
            actions.append("show_exploration_zones")
            actions.append("suggest_interesting_spots")
        
        # Friend pickup mode
        if ContextFlag.FRIEND_NEARBY.value in flags["exploration"]:
            actions.append("enable_friend_pickup_mode")
            actions.append("show_meeting_point_eta")
        
        return actions
    
    def _calculate_safety_adjustments(self, flags: Dict[str, List[str]]) -> Dict[str, Any]:
        """Calculate adjustments to safety scoring"""
        adjustments = {
            "base_multiplier": 1.0,
            "night_bonus": 0.0,
            "familiarity_penalty": 0.0,
            "gps_accuracy_penalty": 0.0,
            "final_multiplier": 1.0
        }
        
        # Night bonus (increase safety importance)
        if "night" in flags["environment"]:
            adjustments["night_bonus"] = 0.3
        elif "dawn_dusk" in flags["environment"]:
            adjustments["night_bonus"] = 0.15
        
        # Unfamiliar area penalty
        if ContextFlag.UNKNOWN_ZONE.value in flags["safety"]:
            adjustments["familiarity_penalty"] = 0.2
        
        # GPS accuracy penalty
        if ContextFlag.WEAK_GPS.value in flags["device"]:
            adjustments["gps_accuracy_penalty"] = 0.25
        
        # Calculate final multiplier
        adjustments["final_multiplier"] = (
            adjustments["base_multiplier"] +
            adjustments["night_bonus"] +
            adjustments["familiarity_penalty"] +
            adjustments["gps_accuracy_penalty"]
        )
        
        return adjustments
    
    def _generate_ui_signals(self, flags: Dict[str, List[str]], algo: AlgoRecommendation) -> List[str]:
        """Generate user-facing UI messages"""
        signals = []
        
        # Device warnings
        if ContextFlag.LOW_BATTERY.value in flags["device"]:
            signals.append("[BATTERY] Low battery - HomeGuard optimized route active")
        
        if ContextFlag.WEAK_GPS.value in flags["device"]:
            signals.append("[GPS] GPS weak - enabling Safe Return")
        
        if ContextFlag.WEAK_SIGNAL.value in flags["device"]:
            signals.append("[SIGNAL] Weak signal - offline mode ready")
        
        # Environment signals
        if "night" in flags["environment"]:
            signals.append("[NIGHT] Night mode - safety scoring increased")
        
        # Safety signals
        if ContextFlag.UNSAFE_ZONE.value in flags["safety"]:
            signals.append("[WARNING] Unknown zone ahead - Safety Core engaged")
        
        if ContextFlag.HIGH_DEVIATION.value in flags["safety"]:
            signals.append("[ALERT] Route deviations detected - suggest safe return?")
        
        # Exploration signals
        if ContextFlag.EXPLORING.value in flags["exploration"]:
            signals.append("[EXPLORE] Exploration recommended in this area")
        
        if ContextFlag.FRIEND_NEARBY.value in flags["exploration"]:
            signals.append("[SOCIAL] Friend detected nearby - ShadowPath ready")
        
        # Algorithm switch notification
        if self.last_recommendation and self.last_recommendation != algo.value:
            signals.append(f"[SWITCH] Switched to {algo.value} for current conditions")
        
        return signals
    
    def get_evaluation_interval(self) -> int:
        """Get current evaluation interval in seconds"""
        return self.evaluation_interval_s
    
    def should_enable_auto_mode(self) -> bool:
        """
        Determine if auto-mode should be recommended.
        
        Auto-mode is recommended when:
        - Device conditions are challenging
        - User is in unfamiliar territory
        - Safety concerns exist
        """
        flags = self._collect_flags()
        
        challenging_conditions = (
            ContextFlag.LOW_BATTERY.value in flags["device"] or
            ContextFlag.WEAK_GPS.value in flags["device"] or
            ContextFlag.UNKNOWN_ZONE.value in flags["safety"] or
            ContextFlag.UNSAFE_ZONE.value in flags["safety"] or
            "night" in flags["environment"]
        )
        
        return challenging_conditions
