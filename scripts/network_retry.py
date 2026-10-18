"""Retry transient network failures while respecting the university server."""
import random
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def resilient_session():
    session = requests.Session()
    retry = Retry(
        total=2, connect=2, read=2, status=2,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(['GET', 'POST']),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session
