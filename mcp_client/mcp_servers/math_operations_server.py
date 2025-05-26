import sys
import os
import math
from typing import Annotated, Dict, Any, Union

from pydantic import Field
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MCP Server for Standard Mathematical Operations")

@mcp.tool()
async def add(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    num1: Annotated[float, Field(description="The first number for addition.")],
    num2: Annotated[float, Field(description="The second number for addition.")]
) -> Dict[str, Any]:
    """
    Adds two numbers (num1 + num2) and returns their sum.
    """
    try:
        result = num1 + num2
        return {"result": result}
    except Exception as e:
        # This is a fallback; type errors are usually caught by Pydantic.
        return {"error": f"An unexpected error occurred during addition: {str(e)}"}

@mcp.tool()
async def subtract(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    a: Annotated[float, Field(description="The number to subtract from (minuend).")],
    b: Annotated[float, Field(description="The number to subtract (subtrahend).")]
) -> Dict[str, Any]:
    """
    Subtracts the second number (b) from the first number (a) and returns the difference (a - b).
    """
    try:
        result = a - b
        return {"result": result}
    except Exception as e:
        return {"error": f"An unexpected error occurred during subtraction: {str(e)}"}

@mcp.tool()
async def multiply(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    num1: Annotated[float, Field(description="The first number for multiplication.")],
    num2: Annotated[float, Field(description="The second number for multiplication.")]
) -> Dict[str, Any]:
    """
    Multiplies two numbers (num1 * num2) and returns their product.
    """
    try:
        result = num1 * num2
        return {"result": result}
    except Exception as e:
        return {"error": f"An unexpected error occurred during multiplication: {str(e)}"}

@mcp.tool()
async def divide(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    numerator: Annotated[float, Field(description="The number to be divided (numerator).")],
    denominator: Annotated[float, Field(description="The number to divide by (denominator).")]
) -> Dict[str, Any]:
    """
    Divides the numerator by the denominator (numerator / denominator).
    Handles division by zero by returning an error.
    """
    try:
        if denominator == 0:
            return {"error": "Division by zero is undefined. The denominator cannot be zero."}
        result = numerator / denominator
        return {"result": result}
    except Exception as e:
        return {"error": f"An unexpected error occurred during division: {str(e)}"}

@mcp.tool()
async def power(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    base: Annotated[float, Field(description="The base number.")],
    exponent: Annotated[float, Field(description="The exponent.")]
) -> Dict[str, Any]:
    """
    Calculates the base raised to the power of the exponent (base ^ exponent).
    Handles mathematical domain errors (e.g., 0 to a negative power, negative base to a fractional power).
    """
    try:
        result = math.pow(base, exponent)
        return {"result": result}
    except ValueError as ve:
        # Handles cases like 0.0**-1.0 or (-2.0)**0.5 which are domain errors for math.pow
        return {"error": f"Mathematical domain error: {str(ve)}"}
    except OverflowError as oe:
        return {"error": f"Mathematical overflow error: result is too large to represent: {str(oe)}"}
    except Exception as e:
        return {"error": f"An unexpected error occurred during power calculation: {str(e)}"}

@mcp.tool()
async def sqrt(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    number: Annotated[float, Field(description="The number to find the square root of.")]
) -> Dict[str, Any]:
    """
    Calculates the square root of a number.
    Handles negative inputs by returning an error, as real square roots are undefined for negative numbers.
    """
    if number < 0:
        return {"error": "Cannot calculate the real square root of a negative number. Input must be non-negative."}
    try:
        result = math.sqrt(number)
        return {"result": result}
    except ValueError as ve: # Should be caught by number < 0, but as safeguard for other math.sqrt domain errors.
         return {"error": f"Mathematical domain error during square root calculation: {str(ve)}"}
    except Exception as e:
        return {"error": f"An unexpected error occurred during square root calculation: {str(e)}"}

@mcp.tool()
async def modulo(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    a: Annotated[float, Field(description="The dividend (the number to be divided).")],
    b: Annotated[float, Field(description="The divisor (the number to divide by).")],
) -> Dict[str, Any]:
    """
    Calculates the modulo (remainder of a divided by b, i.e., a % b).
    Handles modulo by zero by returning an error.
    """
    try:
        if b == 0:
            return {"error": "Modulo by zero is undefined. The divisor (b) cannot be zero."}
        result = a % b # Python's % operator behavior
        return {"result": result}
    except ZeroDivisionError: # Double catch, `if b == 0` should get it.
        return {"error": "Modulo by zero is undefined. The divisor (b) cannot be zero."}
    except Exception as e:
        return {"error": f"An unexpected error occurred during modulo operation: {str(e)}"}

@mcp.tool()
async def sine(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    angle_radians: Annotated[float, Field(description="The angle in radians for which to calculate the sine.")]
) -> Dict[str, Any]:
    """
    Calculates the sine of an angle provided in radians.
    """
    try:
        result = math.sin(angle_radians)
        return {"result": result}
    except Exception as e:
        # math.sin typically doesn't raise errors for finite float inputs.
        return {"error": f"An unexpected error occurred during sine calculation: {str(e)}"}

@mcp.tool()
async def cosine(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    angle_radians: Annotated[float, Field(description="The angle in radians for which to calculate the cosine.")]
) -> Dict[str, Any]:
    """
    Calculates the cosine of an angle provided in radians.
    """
    try:
        result = math.cos(angle_radians)
        return {"result": result}
    except Exception as e:
        # math.cos typically doesn't raise errors for finite float inputs.
        return {"error": f"An unexpected error occurred during cosine calculation: {str(e)}"}

@mcp.tool()
async def tangent(
    user_number: Annotated[str, Field(description="User identifier, typically a phone number, passed by the MCP system.")],
    angle_radians: Annotated[float, Field(description="The angle in radians for which to calculate the tangent.")]
) -> Dict[str, Any]:
    """
    Calculates the tangent of an angle provided in radians.
    Handles cases where the tangent is undefined (e.g., for angles like pi/2, 3pi/2, etc.) by returning an error.
    """
    try:
        # Tangent is undefined when cos(angle) is 0 (i.e., angle = pi/2 + k*pi)
        cos_val = math.cos(angle_radians)
        # Use a small epsilon for floating point comparison due to precision issues.
        # math.cos(math.pi/2) is not exactly 0 but a very small number.
        epsilon = 1e-15 
        if abs(cos_val) < epsilon:
            return {"error": "Tangent is undefined for this angle because cos(angle) is zero (e.g., pi/2, 3pi/2)."}
        
        result = math.tan(angle_radians)
        # Check for overflow if result is extremely large, though the cos_val check should largely prevent this.
        if math.isinf(result):
             return {"error": "Tangent calculation resulted in overflow (infinity). Angle is likely too close to where tangent is undefined."}
        return {"result": result}
    except OverflowError: # math.tan can raise OverflowError for extreme values.
        return {"error": "Tangent result is too large to represent (overflow). Angle is likely too close to where tangent is undefined."}
    except Exception as e:
        return {"error": f"An unexpected error occurred during tangent calculation: {str(e)}"}

if __name__ == "__main__":
    mcp.run()