"""
OpenAI API interaction utilities.

Provides generic functions for calling OpenAI API with consistent error handling
and default parameter management.
"""

from openai import OpenAI
from .config import (
    base_url,
    api_key,
    rag_response_model,
    DEFAULT_TEMPERATURE,
    DEFAULT_TOP_P,
    DEFAULT_SEED
)


def call_openai_api(messages, model=None, temperature=None, top_p=None, stream=False):
    """
    Generic OpenAI API call function that can be reused anywhere.

    Parameters:
        messages: List of messages in format [{"role": "user", "content": "content"}, ...]
        model: Model name to use, if not specified uses default from config
        temperature: Temperature parameter controlling randomness, if not specified uses config default
        top_p: top_p parameter, if not specified uses config default
        stream: Whether to use streaming response, defaults to False

    Returns:
        If stream=False, returns complete response content
        If stream=True, returns streaming object
        
    Raises:
        Exception: If API call fails or response format is unexpected
    """
    try:
        client = OpenAI(
            base_url=base_url,
            api_key=api_key,
            timeout=30.0  # Increased timeout to 30 seconds
        )

        # If model parameter is None, use default model from config
        if model is None:
            model = rag_response_model

        chat_completion = client.chat.completions.create(
            messages=messages,
            model=model,
            stream=stream,
            temperature=temperature if temperature is not None else DEFAULT_TEMPERATURE,
            top_p=top_p if top_p is not None else DEFAULT_TOP_P,
            seed=DEFAULT_SEED
        )
        
        if not stream:
            # Check if choices exist and are not empty
            if hasattr(chat_completion, 'choices') and chat_completion.choices and len(chat_completion.choices) > 0:
                return chat_completion.choices[0].message.content
            else:
                print(f"Warning: Unexpected API response format: {chat_completion}")
                # Try other possible response formats
                if hasattr(chat_completion, 'content'):
                    return chat_completion.content
                elif hasattr(chat_completion, 'message'):
                    return chat_completion.message
                else:
                    raise ValueError(f"Unable to extract content from API response: {chat_completion}")
        else:
            return chat_completion
    except Exception as e:
        print(f"Error in call_openai_api: {str(e)}")
        raise
