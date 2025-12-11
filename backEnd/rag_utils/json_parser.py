"""
JSON parsing utilities for handling various JSON formats and error cases.

Supports:
- Standard JSON format
- Python dictionary format with single quotes
- Code block wrapped JSON
- Unescaped quotes handling
"""

import json
import ast
from typing import Optional, Dict, Any


def _fix_unescaped_quotes(python_dict_str: str) -> str:
    """
    Fix unescaped double quotes in Python dictionary strings.
    When string values are wrapped in double quotes but contain unescaped double quotes,
    escape these internal quotes.
    
    Args:
        python_dict_str: Python dictionary format string
        
    Returns:
        Fixed string
    """
    result = []
    i = 0
    length = len(python_dict_str)
    
    while i < length:
        char = python_dict_str[i]
        
        if char == '"' and i > 0:
            prev_char_idx = i - 1
            while prev_char_idx >= 0 and python_dict_str[prev_char_idx] in [' ', '\n', '\t', '\r']:
                prev_char_idx -= 1
            
            if prev_char_idx >= 0 and python_dict_str[prev_char_idx] in [':', ',', '[', '{']:
                result.append(char)
                i += 1
                
                while i < length:
                    if python_dict_str[i] == '"':
                        if i > 0 and python_dict_str[i-1] == '\\':
                            result.append('\\"')
                            i += 1
                        else:
                            next_char_idx = i + 1
                            while next_char_idx < length and python_dict_str[next_char_idx] in [' ', '\n', '\t', '\r']:
                                next_char_idx += 1
                            
                            if next_char_idx >= length or python_dict_str[next_char_idx] in [',', '}', ']', '\n']:
                                result.append('"')
                                i += 1
                                break
                            else:
                                result.append('\\"')
                                i += 1
                    elif python_dict_str[i] == '\\':
                        if i + 1 < length:
                            result.append('\\')
                            result.append(python_dict_str[i+1])
                            i += 2
                        else:
                            result.append('\\')
                            i += 1
                    else:
                        result.append(python_dict_str[i])
                        i += 1
                continue
        
        result.append(char)
        i += 1
    
    return ''.join(result)


def _convert_python_dict_to_json(python_dict_str: str) -> str:
    """
    Convert Python dictionary format string to JSON format.
    Intelligently handle single quotes and double quotes in string values.
    
    Args:
        python_dict_str: Python dictionary format string, e.g. {'key': 'value'}
        
    Returns:
        JSON format string
    """
    result = []
    i = 0
    length = len(python_dict_str)
    in_string = False
    string_quote = None
    
    def find_string_end(start_idx, quote_char):
        """Find string end position, intelligently handle internal quotes"""
        idx = start_idx + 1
        while idx < length:
            char = python_dict_str[idx]
            
            if char == quote_char:
                if idx > start_idx + 1 and python_dict_str[idx - 1] == '\\':
                    idx += 1
                    continue
                else:
                    next_char_idx = idx + 1
                    while next_char_idx < length and python_dict_str[next_char_idx] in [' ', '\n', '\t', '\r']:
                        next_char_idx += 1
                    
                    if (next_char_idx >= length or 
                        python_dict_str[next_char_idx] in [',', '}', ']', '\n']):
                        return idx
            
            idx += 1
        
        return None
    
    while i < length:
        char = python_dict_str[i]
        
        if not in_string:
            if char == "'" and (i == 0 or python_dict_str[i-1] in ['{', ',', ':', ' ', '\n', '\t', '[']):
                key_end = find_string_end(i, "'")
                
                if key_end is not None:
                    next_char_idx = key_end + 1
                    while next_char_idx < length and python_dict_str[next_char_idx] in [' ', '\n', '\t']:
                        next_char_idx += 1
                    
                    if next_char_idx < length and python_dict_str[next_char_idx] == ':':
                        key_content = python_dict_str[i+1:key_end]
                        key_content = key_content.replace('"', '\\"')
                        result.append('"' + key_content + '"')
                        i = key_end + 1
                        continue
                    else:
                        value_content = python_dict_str[i+1:key_end]
                        value_content = value_content.replace('"', '\\"')
                        result.append('"' + value_content + '"')
                        i = key_end + 1
                        continue
            
            elif char == '"':
                result.append(char)
                in_string = True
                string_quote = '"'
                i += 1
                continue
            else:
                result.append(char)
                i += 1
                continue
        
        else:
            if char == '\\' and i + 1 < length:
                result.append(char)
                result.append(python_dict_str[i+1])
                i += 2
                continue
            elif char == string_quote:
                result.append(char)
                in_string = False
                string_quote = None
                i += 1
                continue
            else:
                result.append(char)
                i += 1
                continue
    
    return ''.join(result)


def parse_json_safely(raw_response: str) -> Optional[Dict[str, Any]]:
    """
    Safely parse JSON response, supporting single quotes and code block markers.
    
    Args:
        raw_response: Raw response string
        
    Returns:
        dict: Parsed dictionary data, returns None if parsing fails
    """
    if raw_response is None:
        return None
    
    if not isinstance(raw_response, str):
        raw_response = str(raw_response)
    
    # Clean possible code block markers
    cleaned_response = raw_response.strip()
    if cleaned_response.startswith('```json'):
        cleaned_response = cleaned_response[7:]
    elif cleaned_response.startswith('```'):
        cleaned_response = cleaned_response[3:]
    if cleaned_response.endswith('```'):
        cleaned_response = cleaned_response[:-3]
    cleaned_response = cleaned_response.strip()
    
    if not cleaned_response:
        return None
    
    # Try direct JSON parsing
    try:
        return json.loads(cleaned_response)
    except json.JSONDecodeError:
        # JSON parsing failed, try handling Python dict format
        try:
            response_data = ast.literal_eval(cleaned_response)
            if isinstance(response_data, dict):
                return response_data
            else:
                raise ValueError("Not a dictionary format")
        except (ValueError, SyntaxError):
            # ast parsing failed, may be quote issues
            try:
                fixed_response = _fix_unescaped_quotes(cleaned_response)
                if fixed_response != cleaned_response:
                    try:
                        response_data = ast.literal_eval(fixed_response)
                        if isinstance(response_data, dict):
                            return response_data
                    except (ValueError, SyntaxError):
                        pass
            except Exception:
                pass
            
            # Try intelligent single quote replacement
            try:
                cleaned_response = _convert_python_dict_to_json(cleaned_response)
                return json.loads(cleaned_response)
            except (json.JSONDecodeError, ValueError, TypeError):
                return None
