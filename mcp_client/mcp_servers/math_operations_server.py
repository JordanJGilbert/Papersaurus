
import sys
import os
_mcp_package_parent_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
if _mcp_package_parent_dir not in sys.path:
    sys.path.append(_mcp_package_parent_dir)

from mcp.server.fastmcp import FastMCP
from typing import Any, Optional, List, Dict
import inspect

# --- User's Python code to be wrapped ---
import os
import json
import requests # Ensure requests is imported for internal tool calls

def generated_function_name(user_id: str, num1: float, num2: float) -> dict:
    """
    Performs standard mathematical operations (addition, subtraction, multiplication,
    division, modulo, and exponentiation) on two input numbers.

    Args:
        user_id (str): The user identifier for context (not directly used in this math function).
        num1 (float): The first number for the operations.
        num2 (float): The second number for the operations.

    Returns:
        dict: A dictionary containing the results of each operation.
              - 'addition' (float): The sum of num1 and num2.
              - 'subtraction' (float): The difference of num1 and num2.
              - 'multiplication' (float): The product of num1 and num2.
              - 'division' (float | str): The quotient of num1 and num2. Returns a string
                                          "Division by zero is undefined" if num2 is 0.
              - 'modulo' (float | str): The remainder of num1 divided by num2. Returns a string
                                        "Modulo by zero is undefined" if num2 is 0.
              - 'exponentiation' (float): num1 raised to the power of num2.

    Raises:
        None: This function handles division and modulo by zero internally by returning
              an informative string for those specific results, rather than raising an error.
    """
    results = {}

    # Addition
    results['addition'] = num1 + num2

    # Subtraction
    results['subtraction'] = num1 - num2

    # Multiplication
    results['multiplication'] = num1 * num2

    # Division
    if num2 == 0:
        results['division'] = "Division by zero is undefined"
    else:
        results['division'] = num1 / num2

    # Modulo
    if num2 == 0:
        results['modulo'] = "Modulo by zero is undefined"
    else:
        results['modulo'] = num1 % num2

    # Exponentiation
    results['exponentiation'] = num1 ** num2

    return results
# --- End of User's Python code ---

if 'generated_function_name' not in globals() or not callable(globals()['generated_function_name']):
    print("CRITICAL SERVER SETUP ERROR: The provided python_code_to_wrap did not define a callable function "
          "named 'generated_function_name'. This server will likely fail to start or operate correctly.")

_target_func_to_expose = globals().get('generated_function_name')

mcp = FastMCP("A server that provides standard mathematical operations.")

@mcp.tool(name="standard_math_operations", description="Performs addition, subtraction, multiplication, division, modulo, and exponentiation on two numbers.")
def standard_math_operations(user_id: str, num1: float, num2: float) -> Any:
    '''
    Performs addition, subtraction, multiplication, division, modulo, and exponentiation on two numbers.
    
    This tool wraps the dynamically provided 'generated_function_name' function.
    Original function signature: (user_id: str, num1: float, num2: float) -> dict
    Original function is async: False
    '''
    # Call the original function with the exact parameters it expects
    _func_runtime_check = globals().get('generated_function_name')
    if not callable(_func_runtime_check):
        return {"error": "Wrapped function 'generated_function_name' is not callable or not found in the server environment."}
        
    return _func_runtime_check(user_id, num1, num2)

if __name__ == "__main__":
    print(f"Attempting to start MCP Server: 'A server that provides standard mathematical operations.' with tool 'standard_math_operations' exposing 'generated_function_name'.")
    # Final check before mcp.run()
    _final_check_func = globals().get('generated_function_name')
    if not callable(_final_check_func):
        print("ERROR: Cannot start server. 'generated_function_name' is not defined or not callable.")
        sys.exit(1)
    mcp.run()
