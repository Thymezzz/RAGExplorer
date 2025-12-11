"""
Rate limiter for SiliconFlow API calls
Prevents exceeding RPM and TPM limits
"""

import threading
import time
import random
from typing import Union, List


def get_next_api_key():
    """Get next API key from the pool with random selection"""
    from .config import EMBEDDING_API_KEYS
    # Use time as random seed for better randomness
    random.seed(time.time())
    return random.choice(EMBEDDING_API_KEYS)


def is_rate_limit_error(error_msg):
    """Check if error is a rate limit error"""
    error_lower = error_msg.lower()
    return any(keyword in error_lower for keyword in ['400', 'rate limit', 'quota', 'too many requests'])


class SiliconFlowRateLimiter:
    """
    SiliconFlow API rate limiter
    Limits:
    - RPM (Requests Per Minute): max 2000
    - TPM (Tokens Per Minute): max 1,000,000
    """
    def __init__(self, rpm_limit: int = 2000, tpm_limit: int = 1000000):
        self.rpm_limit = rpm_limit
        self.tpm_limit = tpm_limit
        
        # Use dictionary to store counters for each API key (multi-key support)
        self.request_timestamps = {}  # {api_key: [timestamp1, timestamp2, ...]}
        self.token_counts = {}  # {api_key: [(timestamp, tokens), ...]}
        self.lock = threading.Lock()  # Thread lock to protect shared data
        
    def _estimate_tokens(self, texts: Union[str, List[str]]) -> int:
        """
        Estimate token count for texts
        Rough estimate: 1 token ≈ 4 characters
        """
        if isinstance(texts, str):
            texts = [texts]
        
        total_chars = sum(len(text) for text in texts)
        # Use 3.5 chars/token for conservative estimate
        estimated_tokens = int(total_chars / 3.5)
        return max(estimated_tokens, len(texts))  # At least 1 token per text
    
    def _clean_old_entries(self, api_key: str):
        """Clean entries older than one minute"""
        current_time = time.time()
        one_minute_ago = current_time - 60
        
        # Clean request timestamps
        if api_key in self.request_timestamps:
            self.request_timestamps[api_key] = [
                ts for ts in self.request_timestamps[api_key] 
                if ts > one_minute_ago
            ]
        
        # Clean token counts
        if api_key in self.token_counts:
            self.token_counts[api_key] = [
                (ts, tokens) for ts, tokens in self.token_counts[api_key]
                if ts > one_minute_ago
            ]
    
    def _check_and_wait(self, api_key: str, estimated_tokens: int):
        """
        Check if limits are exceeded, wait if necessary
        """
        # Loop until can send request
        while True:
            with self.lock:
                self._clean_old_entries(api_key)
                
                # Initialize counters
                if api_key not in self.request_timestamps:
                    self.request_timestamps[api_key] = []
                if api_key not in self.token_counts:
                    self.token_counts[api_key] = []
                
                current_time = time.time()
                
                # Check RPM limit
                recent_requests = len(self.request_timestamps[api_key])
                rpm_wait_time = 0
                if recent_requests >= self.rpm_limit:
                    # Need to wait until oldest request exceeds 1 minute
                    oldest_request = min(self.request_timestamps[api_key])
                    rpm_wait_time = 60 - (current_time - oldest_request) + 0.1  # Add 0.1s buffer
                
                # Check TPM limit
                recent_tokens = sum(tokens for _, tokens in self.token_counts[api_key])
                tpm_wait_time = 0
                if recent_tokens + estimated_tokens > self.tpm_limit:
                    # Need to wait until have enough token quota
                    if self.token_counts[api_key]:
                        oldest_token_entry = min(self.token_counts[api_key], key=lambda x: x[0])
                        tpm_wait_time = 60 - (current_time - oldest_token_entry[0]) + 0.1
                        if tpm_wait_time > 0:
                            # Calculate tokens that will be released after waiting
                            tokens_to_release = sum(
                                tokens for ts, tokens in self.token_counts[api_key]
                                if ts <= oldest_token_entry[0] + tpm_wait_time
                            )
                            if recent_tokens - tokens_to_release + estimated_tokens > self.tpm_limit:
                                # Need longer wait time
                                tpm_wait_time = max(tpm_wait_time, 
                                                  (recent_tokens + estimated_tokens - self.tpm_limit) / 
                                                  (self.tpm_limit / 60) + 0.1)
                    else:
                        # No history, wait directly
                        tpm_wait_time = (estimated_tokens / self.tpm_limit) * 60 + 0.1
                
                # Calculate required wait time
                wait_time = max(rpm_wait_time, tpm_wait_time)
                
                if wait_time > 0:
                    # Need to wait, release lock then wait
                    pass
                else:
                    # Can send immediately, record request and return
                    self.request_timestamps[api_key].append(current_time)
                    self.token_counts[api_key].append((current_time, estimated_tokens))
                    return
            
            # Wait outside lock (so other threads can also check rate limits)
            if wait_time > 0:
                if rpm_wait_time > 0 and tpm_wait_time > 0:
                    print(f"⏳ RPM/TPM limit: waiting {wait_time:.1f} seconds (need {estimated_tokens} tokens, currently used {recent_tokens}/{self.tpm_limit})...")
                elif rpm_wait_time > 0:
                    print(f"⏳ RPM limit: waiting {wait_time:.1f} seconds...")
                elif tpm_wait_time > 0:
                    print(f"⏳ TPM limit: waiting {wait_time:.1f} seconds (need {estimated_tokens} tokens, currently used {recent_tokens}/{self.tpm_limit})...")
                time.sleep(wait_time)
    
    def wait_if_needed(self, api_key: str, texts: Union[str, List[str]]):
        """
        Call this method before API call, will wait automatically if limit exceeded
        
        Args:
            api_key: API key (for multi-key support)
            texts: Text or list of texts to process
        """
        estimated_tokens = self._estimate_tokens(texts)
        self._check_and_wait(api_key, estimated_tokens)


# Global rate limiter instance
_siliconflow_rate_limiter = SiliconFlowRateLimiter(rpm_limit=2000, tpm_limit=1000000)
