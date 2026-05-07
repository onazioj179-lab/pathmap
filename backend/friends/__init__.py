"""
PATHMAP - Friends System Module
===============================
Friend management, requests, and social features.
"""

from .friend_manager import FriendManager, get_friend_manager
from .friend_groups import FriendGroups, get_friend_groups
from .friend_requests import FriendRequestHandler, get_friend_request_handler

__all__ = [
    'FriendManager',
    'get_friend_manager',
    'FriendGroups',
    'get_friend_groups',
    'FriendRequestHandler',
    'get_friend_request_handler'
]
