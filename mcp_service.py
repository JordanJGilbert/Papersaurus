#!/usr/bin/env python3
import os
import sys
import json
import asyncio
import tempfile
import base64
import mimetypes
from typing import Dict, List, Any, Optional, Tuple, Set
import uvicorn
from fastapi import FastAPI, Request, HTTPException, Security, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from contextlib import asynccontextmanager, AsyncExitStack
from collections import defaultdict
import logging

# Import for MCP client sessions and server parameters
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp import types # Corrected import for type hinting

# Import new history function from ai_models
from ai_models import function_calling_loop, clear_conversation_history_for_user

# Load environment variables - REMOVED .env file specific loading.
# The application will now rely on environment variables being set globally.
# For example, set MCP_INTERNAL_API_KEY in your shell or deployment environment.
logging.info("Relying on globally set environment variables. Ensure necessary variables (e.g., MCP_INTERNAL_API_KEY, API keys for services) are available.")

# Path to the dynamic servers configuration file
DYNAMIC_SERVERS_JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dynamic_servers.json")
USER_PREFS_JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_server_preferences.json")

# --- Placeholder for Internal API Key (SHOULD BE IN ENV VARS) ---
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "your_secret_internal_api_key_here")
INTERNAL_API_KEY_NAME = "X-Internal-API-Key"

from fastapi.security.api_key import APIKeyHeader
api_key_header = APIKeyHeader(name=INTERNAL_API_KEY_NAME, auto_error=True)

async def verify_internal_api_key(key: str = Security(api_key_header)):
    if key != INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing internal API Key")
    return key

# --- Utility Functions ---
def load_dynamic_servers_per_user() -> Dict[str, List[Dict[str, Any]]]:
    """Loads dynamic server configurations, now structured per user."""
    if os.path.exists(DYNAMIC_SERVERS_JSON_PATH):
        try:
            with open(DYNAMIC_SERVERS_JSON_PATH, 'r') as f:
                data = json.load(f)
                # Ensure it's a dict where values are lists
                if isinstance(data, dict) and all(isinstance(v, list) for v in data.values()):
                    return data
                else:
                    print(f"Warning: dynamic_servers.json is not in the expected format (Dict[str, List]). Resetting.")
                    return {} # Return empty dict if format is wrong
        except Exception as e:
            print(f"Error loading dynamic servers: {str(e)}")
            return {}
    return {}

def save_dynamic_servers_per_user(user_server_configs: Dict[str, List[Dict[str, Any]]]):
    """Saves dynamic server configurations, structured per user."""
    try:
        with open(DYNAMIC_SERVERS_JSON_PATH, 'w') as f:
            json.dump(user_server_configs, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving dynamic servers: {str(e)}")
        return False

def _mcp_config_key(config: dict) -> str:
    args = config.get("args", [])
    if args is None:
        args = []
    # Ensure consistent key for comparison, especially if env could be None vs {}
    env = config.get("env", {}) 
    if env is None:
        env = {}
    return json.dumps({"command": config.get("command"), "args": args, "env": env}, sort_keys=True)

# Assume a sanitization function similar to test_server.py's sanitize_for_path
# For user IDs, we primarily care about removing '+' for key consistency.
def sanitize_user_id_for_key(user_id_str: str) -> str:
    if not user_id_str:
        return ""
    return user_id_str.replace('+', '')

# === MCPManager CLASS FOR ENCAPSULATION ===
class MCPManager:
    def __init__(self):
        self.exit_stack: Optional[AsyncExitStack] = None
        
        # User-scoped resources
        self.user_sessions: Dict[str, List[ClientSession]] = defaultdict(list)
        self.user_tool_to_session: Dict[str, Dict[str, ClientSession]] = defaultdict(dict)
        self.user_tools: Dict[str, List[types.Tool]] = defaultdict(list) # Store actual mcp.types.Tool objects
        self.user_session_to_tools: Dict[str, Dict[ClientSession, List[str]]] = defaultdict(dict)
        self.user_config_to_session: Dict[str, Dict[str, ClientSession]] = defaultdict(dict)
        
        # Global/Core server resources (could be managed under a special user_id like "_global")
        # For now, let's assume core servers are started and their tools are globally available
        # if a user's preferences select them. This might need refinement.
        self.core_sessions: List[ClientSession] = []
        self.core_tool_to_session: Dict[str, ClientSession] = {}
        self.core_tools: List[types.Tool] = [] # Store actual mcp.types.Tool objects
        self.core_session_to_tools: Dict[ClientSession, List[str]] = {}
        self.core_config_to_session: Dict[str, ClientSession] = {}

        self.temp_files_to_cleanup: List[str] = []
        self.user_server_preferences: Dict[str, List[str]] = {} # Key: user_id, Value: List of config_keys
        self.initialized: bool = False

        # --- Define default enabled core server config keys ---
        # These servers will always be active for users if running,
        # regardless of their explicit preferences.
        self.default_core_server_config_keys: Set[str] = set()

    async def initialize_exit_stack(self):
        if not self.exit_stack:
            self.exit_stack = AsyncExitStack()
            await self.exit_stack.__aenter__()

        # --- Populate default_core_server_config_keys after exit_stack is up ---
        # This ensures _mcp_config_key can be called if it relies on any global state
        # that might be set up during a broader initialization phase (though it's simple here).
        # Assuming CORE_SERVER_COMMANDS is accessible here or passed in.
        # For this example, we'll use the global CORE_SERVER_COMMANDS.
        # A more robust solution might pass CORE_SERVER_COMMANDS to the constructor or initialize.
        global CORE_SERVER_COMMANDS
        for core_conf in CORE_SERVER_COMMANDS:
            # Make all core servers default
            self.default_core_server_config_keys.add(_mcp_config_key(core_conf))
        print(f"MCPManager: Default core server config keys set to: {self.default_core_server_config_keys}")

    def load_user_preferences_from_file(self):
        if os.path.exists(USER_PREFS_JSON_PATH):
            try:
                with open(USER_PREFS_JSON_PATH, 'r') as f:
                    loaded_prefs = json.load(f)
                    if isinstance(loaded_prefs, dict):
                        self.user_server_preferences = loaded_prefs
                    else:
                        self.user_server_preferences = {}
            except Exception as e:
                print(f"Error loading user preferences: {e}")
                self.user_server_preferences = {}
        else:
            self.user_server_preferences = {}
        print(f"Loaded {len(self.user_server_preferences)} user preference entries.")

    def save_user_preferences_to_file(self):
        try:
            with open(USER_PREFS_JSON_PATH, 'w') as f:
                json.dump(self.user_server_preferences, f, indent=4)
            print(f"Saved {len(self.user_server_preferences)} user preference entries.")
        except Exception as e:
            print(f"Error saving user preferences: {e}")

    async def start_single_server(self, server_config: Dict[str, Any], user_id: Optional[str] = None) -> bool:
        """
        Starts a single server. If user_id is provided, it's a user-specific server.
        If user_id is None, it's treated as a core/global server.
        """
        if self.exit_stack is None:
            raise RuntimeError("MCPManager.exit_stack not initialized.")

        config_key = _mcp_config_key(server_config)
        
        # Determine which set of dictionaries to use
        is_core_server = user_id is None
        sessions_dict = self.core_sessions if is_core_server else self.user_sessions[user_id]
        tool_to_session_map = self.core_tool_to_session if is_core_server else self.user_tool_to_session[user_id]
        tools_list = self.core_tools if is_core_server else self.user_tools[user_id]
        session_to_tools_map = self.core_session_to_tools if is_core_server else self.user_session_to_tools[user_id]
        config_to_session_map = self.core_config_to_session if is_core_server else self.user_config_to_session[user_id]

        if config_key in config_to_session_map:
            print(f"MCPManager: Server (user: {user_id or 'core'}) with config {config_key} is already running or known. Skipping start.")
            return True

        command = server_config["command"]
        args = server_config.get("args", [])
        env = dict(os.environ)
        if "env" in server_config and isinstance(server_config["env"], dict):
            env.update(server_config["env"])
        
        server_params = StdioServerParameters(command=command, args=args, env=env, log_stderr=True, log_stdout=True)
        
        try:
            prefix = f"(User: {user_id})" if user_id else "(Core)"
            print(f"MCPManager: {prefix} Attempting to start server: {server_config}")
            
            stdio_transport = await self.exit_stack.enter_async_context(stdio_client(server_params))
            stdio, write = stdio_transport
            session = await self.exit_stack.enter_async_context(ClientSession(stdio, write))
            await session.initialize()
            
            response = await session.list_tools()
            tool_names_for_this_session = []
            for tool_obj in response.tools: # tool_obj is mcp.types.Tool
                # For user-specific tools, names only need to be unique within that user's scope.
                # For core tools, names should ideally be globally unique or carefully managed.
                if tool_obj.name in tool_to_session_map:
                    print(f"Warning: {prefix} Tool '{tool_obj.name}' from server {server_config} conflicts with an existing tool for this scope. It will be overridden.")
                
                tool_to_session_map[tool_obj.name] = session
                
                # Remove any existing tool with the same name from this scope's list
                # This is a simple override. More sophisticated merging might be needed if tools from different
                # servers (within the same scope) could have the same name but different functionality.
                original_len = len(tools_list)
                tools_list[:] = [t for t in tools_list if t.name != tool_obj.name]
                if len(tools_list) < original_len:
                     print(f"MCPManager: {prefix} Overrode existing tool '{tool_obj.name}' in scope list.")
                tools_list.append(tool_obj)
                tool_names_for_this_session.append(tool_obj.name)
            
            sessions_dict.append(session)
            session_to_tools_map[session] = tool_names_for_this_session
            config_to_session_map[config_key] = session
            print(f"MCPManager: {prefix} Successfully started and registered tools for server: {server_config}")
            return True
        except Exception as e:
            print(f"MCPManager: {prefix} Error starting or registering server {server_config}: {str(e)}")
            import traceback
            print(f"MCPManager: {prefix} Traceback: {traceback.format_exc()}")
            return False

    async def startup_all_servers(self, core_server_configs: List[Dict[str, Any]], dynamic_user_server_configs: Dict[str, List[Dict[str, Any]]]):
        await self.initialize_exit_stack() # This now also populates default_core_server_config_keys

        startup_tasks = []
        
        print(f"MCPManager: Queueing {len(core_server_configs)} core server configurations for startup...")
        for core_conf in core_server_configs:
            startup_tasks.append(self.start_single_server(core_conf, user_id=None)) # user_id=None for core

        print(f"MCPManager: Queueing dynamic server configurations for {len(dynamic_user_server_configs)} users.")
        for user_id, configs_for_user in dynamic_user_server_configs.items():
            print(f"MCPManager: Queueing {len(configs_for_user)} servers for user '{user_id}'.")
            for user_conf in configs_for_user:
                startup_tasks.append(self.start_single_server(user_conf, user_id=user_id))

        if startup_tasks:
            print(f"MCPManager: Attempting to start {len(startup_tasks)} MCP servers concurrently...")
            results = await asyncio.gather(*startup_tasks, return_exceptions=False)
            successful_starts = sum(1 for r in results if r is True)
            failed_starts = len(results) - successful_starts
            print(f"MCPManager: Concurrent server startup complete. Successfully started: {successful_starts}, Failed: {failed_starts}")
        else:
            print("MCPManager: No server configurations found to start.")
        
        self.initialized = True
        total_user_tools = sum(len(tl) for tl in self.user_tools.values()) # tl is now List[types.Tool]
        print(f"MCPManager: Service initialized with {len(self.core_tools)} core tools and {total_user_tools} user-specific tools from various sessions.")

    def get_tools_for_user_query(self, user_id: str) -> Tuple[List[types.Tool], Dict[str, ClientSession]]:
        """
        Returns all available tools for the user: all core tools plus all dynamic servers started for that user.
        Preferences are no longer applied; users see all running core and their running dynamic servers.
        """
        user_effective_tools_list: List[types.Tool] = []
        user_effective_tool_to_session_map: Dict[str, ClientSession] = {}

        # Active config keys: default core servers
        active_config_keys = set(self.default_core_server_config_keys)
        # Include all dynamic server configs started by the user
        if user_id in self.user_config_to_session:
            for config_key, session in self.user_config_to_session[user_id].items():
                if session in self.user_sessions.get(user_id, []):
                    active_config_keys.add(config_key)

        # Collect tools from user's dynamic servers
        if user_id in self.user_config_to_session:
            users_own_tools_raw = self.user_tools.get(user_id, [])
            users_own_tool_to_session_raw = self.user_tool_to_session.get(user_id, {})
            for config_key, session in self.user_config_to_session[user_id].items():
                if config_key in active_config_keys and session in self.user_sessions.get(user_id, []):
                    tool_names_for_session = self.user_session_to_tools.get(user_id, {}).get(session, [])
                    for tool_name in tool_names_for_session:
                        if tool_name not in user_effective_tool_to_session_map:
                            tool_object = next((t for t in users_own_tools_raw if t.name == tool_name and users_own_tool_to_session_raw.get(t.name) == session), None)
                            if tool_object:
                                user_effective_tools_list.append(tool_object)
                                user_effective_tool_to_session_map[tool_name] = session

        # Collect tools from core servers
        for config_key, session in self.core_config_to_session.items():
            if config_key in active_config_keys and session in self.core_sessions:
                tool_names_for_session = self.core_session_to_tools.get(session, [])
                for tool_name in tool_names_for_session:
                    if tool_name not in user_effective_tool_to_session_map:
                        tool_object = next((t for t in self.core_tools if t.name == tool_name and self.core_tool_to_session.get(t.name) == session), None)
                        if tool_object:
                            user_effective_tools_list.append(tool_object)
                            user_effective_tool_to_session_map[tool_name] = session
        print(f"MCPManager: User {user_id} will have access to {len(user_effective_tools_list)} tools: {[t.name for t in user_effective_tools_list]}")
        return user_effective_tools_list, user_effective_tool_to_session_map

    def remove_tools_for_server_by_config(self, server_config_to_remove: dict, user_id: Optional[str]) -> bool:
        """Removes tools for a server. If user_id is None, targets a core server."""
        config_key = _mcp_config_key(server_config_to_remove)
        
        is_core_server = user_id is None
        sessions_list = self.core_sessions if is_core_server else self.user_sessions.get(user_id, [])
        config_to_session_map = self.core_config_to_session if is_core_server else self.user_config_to_session.get(user_id, {})
        session_to_tools_map = self.core_session_to_tools if is_core_server else self.user_session_to_tools.get(user_id, {})
        tools_list_ref = self.core_tools if is_core_server else self.user_tools.get(user_id) # This is a list or None
        tool_to_session_map_ref = self.core_tool_to_session if is_core_server else self.user_tool_to_session.get(user_id) # This is a dict or None

        session_to_remove = config_to_session_map.get(config_key)

        if not session_to_remove:
            print(f"MCPManager: [Internal Remove] No active session found for config (user: {user_id or 'core'}): {config_key}. Tools might already be inactive.")
            return False

        tool_names_to_remove = session_to_tools_map.get(session_to_remove, [])
        
        if tools_list_ref is not None:
            tools_list_ref[:] = [tool for tool in tools_list_ref if tool.name not in tool_names_to_remove]
        
        if tool_to_session_map_ref is not None:
            for name in tool_names_to_remove:
                if tool_to_session_map_ref.get(name) == session_to_remove:
                    tool_to_session_map_ref.pop(name, None)
        
        session_to_tools_map.pop(session_to_remove, None)
        config_to_session_map.pop(config_key, None)
        
        if session_to_remove in sessions_list:
            sessions_list.remove(session_to_remove)
        
        # Note: We are not stopping the actual server process here or closing the session from exit_stack.
        # The exit_stack handles graceful shutdown of all managed contexts on service exit.
        # If a server needs to be truly stopped and restarted (e.g., after code update),
        # that requires more complex process management not covered by simple de-registration.
        # This function primarily de-registers tools from being used.
        
        print(f"MCPManager: [Internal Remove] De-registered tools {tool_names_to_remove} for server (user: {user_id or 'core'}) {config_key}.")
        return True

    def get_all_known_server_configs_for_user(self, user_id: str, core_server_configs: List[Dict[str,Any]]) -> List[Dict[str, Any]]:
        """Gets all server configurations a specific user might interact with (their own + core)."""
        known_configs: Dict[str, Dict[str, Any]] = {} # Use dict to ensure uniqueness by config_key

        # Add core servers
        for core_conf in core_server_configs:
            key = _mcp_config_key(core_conf)
            if key not in known_configs:
                known_configs[key] = core_conf
        
        # Add user's own dynamic servers
        all_user_dynamic_configs = load_dynamic_servers_per_user()
        user_specific_dynamic_configs = all_user_dynamic_configs.get(user_id, [])
        for user_conf in user_specific_dynamic_configs:
            key = _mcp_config_key(user_conf)
            if key not in known_configs: # Should generally be unique by path if user_id is in path
                known_configs[key] = user_conf
                
        return list(known_configs.values())
    
    def get_all_globally_known_server_configs(self, core_server_configs: List[Dict[str,Any]]) -> List[Dict[str, Any]]:
        """Gets all server configurations known to the system across all users and core."""
        all_configs: Dict[str, Dict[str, Any]] = {}

        for core_conf in core_server_configs:
            key = _mcp_config_key(core_conf)
            if key not in all_configs:
                all_configs[key] = core_conf
        
        dynamic_servers_by_user = load_dynamic_servers_per_user()
        for user_id, configs_for_user in dynamic_servers_by_user.items():
            for user_conf in configs_for_user:
                key = _mcp_config_key(user_conf)
                # It's possible for different users to create servers with identical config if paths aren't perfectly unique,
                # but _mcp_config_key relies on command+args. If args includes user-specific path, it should be unique.
                if key not in all_configs:
                    all_configs[key] = {**user_conf, "_owner_user_id": user_id} # Add owner info
        return list(all_configs.values())


    async def shutdown(self):
        print("MCPManager: Shutting down...")
        if self.exit_stack:
            await self.exit_stack.aclose() 
            self.exit_stack = None 
        
        for temp_file in self.temp_files_to_cleanup:
            try:
                if os.path.exists(temp_file):
                    os.unlink(temp_file)
            except Exception as e:
                print(f"MCPManager: Error cleaning up temporary file {temp_file}: {str(e)}")
        self.temp_files_to_cleanup = [] 

        self.initialized = False
        print("MCPManager: Shutdown complete.")

# --- Global State ---
CORE_SERVER_COMMANDS: List[Dict[str, Any]] = [
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/document_generation_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/image_services_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/google_services_server.py"]
    },

    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/mcp_management_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/utility_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/search_mcp_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/attachment_management_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/google_maps_server.py"]
    },
    {
        "command": "python",
        "args": ["mcp_client/mcp-servers/python_code_execution_server.py"]
    }
]

mcp_manager: Optional[MCPManager] = None
service_globally_initialized = False


# --- FastAPI Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    global mcp_manager, service_globally_initialized, CORE_SERVER_COMMANDS

    print("FastAPI Lifespan: MCP service starting up...")
    mcp_manager = MCPManager()
    
    try:
        # dynamic_user_servers_map = load_dynamic_servers_per_user()  # <-- Temporarily disabled
        # await mcp_manager.startup_all_servers(CORE_SERVER_COMMANDS, dynamic_user_servers_map)  # <-- Temporarily disabled
        await mcp_manager.startup_all_servers(CORE_SERVER_COMMANDS, {})  # Only start core servers
        service_globally_initialized = mcp_manager.initialized 
    except Exception as e:
        print(f"FastAPI Lifespan: Error during MCP service startup: {str(e)}")
        import traceback
        print(f"FastAPI Lifespan: Traceback: {traceback.format_exc()}")
        service_globally_initialized = False 
    
    yield 
    
    print("FastAPI Lifespan: MCP service shutting down...")
    if mcp_manager:
        # mcp_manager.save_user_preferences_to_file() 
        await mcp_manager.shutdown()
    service_globally_initialized = False
    print("FastAPI Lifespan: MCP service shutdown complete.")


app = FastAPI(title="MCP Service API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class QueryRequest(BaseModel):
    query: str
    sender: Optional[str] = None # Will be treated as user_id
    attachments: Optional[List[Dict[str, Any]]] = None
    model: Optional[str] = "gpt-4.1-2025-04-14" # Default model, will be overridden if Gemini is chosen by logic
    stream: Optional[bool] = False # ADDED to request streaming

class AddServerRequest(BaseModel):
    user_id: str # Explicit user_id for adding a server
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

class RemoveServerRequest(BaseModel):
    user_id: Optional[str] = None # Optional: if None, targets a core server by config
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

class QueryResponse(BaseModel):
    result: str
    error: Optional[str] = None

class StatusResponse(BaseModel):
    status: str
    core_tools_count: int = 0
    user_specific_tools_count: int = 0 # Approximate, sum over users
    error: Optional[str] = None

class ToolResponse(BaseModel):
    name: str
    description: str
    input_schema: Dict[str, Any]

class ToolsListResponse(BaseModel): # For a specific user
    tools: List[ToolResponse]
    count: int

class ServerDetail(BaseModel):
    config_key: str
    command: str
    args: List[str]
    env: Optional[Dict[str,str]] = None # Added env
    description: Optional[str] = "N/A" # This would ideally come from server itself
    is_running: bool
    tools_provided: List[str] = []
    owner_user_id: Optional[str] = None # For global list, indicates owner if dynamic

class AvailableServersResponse(BaseModel): # For a specific user or global list
    servers: List[ServerDetail]

class UserSelectedServers(BaseModel):
    selected_config_keys: List[str]

class InternalToolCallRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    user_id_context: Optional[str] = None # User ID for context if the target tool is user-specific or needs user context


# --- FastAPI Endpoints ---

@app.get("/status", response_model=StatusResponse)
async def get_status():
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager:
        return StatusResponse(status="Not Initialized", error="MCP service or manager has not been initialized")
    
    total_user_tools = sum(len(tools) for tools in mcp_manager.user_tools.values())
    return StatusResponse(
        status="Initialized" if mcp_manager.initialized else "Manager Not Ready",
        core_tools_count=len(mcp_manager.core_tools),
        user_specific_tools_count=total_user_tools
    )

@app.get("/users/{user_id_path}/tools", response_model=ToolsListResponse) # Changed to user-specific
async def get_tools_for_user(user_id_path: str):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    effective_tools, _ = mcp_manager.get_tools_for_user_query(user_id)
    tools_list_response = []
    for tool_obj in effective_tools: 
        tools_list_response.append(
            ToolResponse(
                name=tool_obj.name,
                description=tool_obj.description,
                input_schema=tool_obj.inputSchema 
            )
        )
    return ToolsListResponse(tools=tools_list_response, count=len(tools_list_response))


@app.post("/query", response_model=QueryResponse) # response_model might need adjustment for streaming if not using QueryResponse for stream end
async def handle_query(request: QueryRequest):
    print(f"MCP_SERVICE_LOG: Received query request: {request.model_dump_json(indent=2)}")
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        # For streaming requests, can't easily return HTTPExcept in body if headers already sent.
        # This check happens before stream setup, so HTTPException is fine.
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    raw_user_id = request.sender or "default_user_for_chatbot" # Default user_id for chatbot if not provided by frontend
    user_id = sanitize_user_id_for_key(raw_user_id)
    
    user_specific_mcp_tools_list, user_specific_mcp_tool_to_session_map = mcp_manager.get_tools_for_user_query(user_id)

    # Determine which model to use for this query - for now, assume Gemini for streaming
    # This logic can be expanded later based on request.model or other factors
    # For this task, if request.stream is True, we are targeting Gemini via the adapter in function_calling_loop.
    query_model = request.model
    if request.stream: # If streaming, imply Gemini for now as it's the one we set up for streaming
        # The actual model selection happens inside function_calling_loop based on its internal logic for now
        # or could be passed if function_calling_loop is updated to accept model_name.
        print(f"Streaming requested for user {user_id}. Will use Gemini via adapter.")

    if request.stream:
        async def stream_generator():
            queue = asyncio.Queue()
            
            async def stream_chunk_handler_for_service(chunk: Dict[str, Any]):
                # This handler is called by function_calling_loop (via LLM adapter) for each stream chunk
                await queue.put(json.dumps(chunk) + "\n")
                # Do NOT put None on the queue here or set finished_event.
                # The function_calling_loop task will signal its completion.
            
            async def run_function_calling_and_signal_completion():
                try:
                    await function_calling_loop(
                        user_input=request.query,
                        mcp_tools_list=user_specific_mcp_tools_list,
                        mcp_tool_to_session_map=user_specific_mcp_tool_to_session_map,
                        user_number=user_id,
                        attachments=request.attachments,
                        stream_chunk_handler=stream_chunk_handler_for_service
                    )
                except Exception as e:
                    # If function_calling_loop itself raises an unhandled exception,
                    # try to send an error chunk before signaling completion.
                    print(f"ERROR in function_calling_loop task: {e}")
                    traceback.print_exc() # Log the full traceback
                    try:
                        error_chunk = {"type": "error", "content": f"Unhandled error in backend processing: {str(e)}"}
                        await queue.put(json.dumps(error_chunk) + "\n")
                    except Exception as e_cb:
                        print(f"Failed to send final error chunk to queue: {e_cb}")
                finally:
                    # Signal that function_calling_loop (and thus all its streaming turns) is complete.
                    await queue.put(None) 
            
            # Run function_calling_loop in a background task
            loop_task = asyncio.create_task(run_function_calling_and_signal_completion())
            
            while True:
                item = await queue.get()
                if item is None: # End of stream signal from run_function_calling_and_signal_completion
                    break
                yield item
                queue.task_done()
            
            await loop_task # Ensure the background task is awaited/cleaned up if it hasn't finished

        return StreamingResponse(stream_generator(), media_type="application/x-ndjson")
    else: # Non-streaming case (original behavior)
        try:
            result, updated_history, error = await function_calling_loop(
                user_input=request.query,
                mcp_tools_list=user_specific_mcp_tools_list,
                mcp_tool_to_session_map=user_specific_mcp_tool_to_session_map,
                user_number=user_id, 
                attachments=request.attachments,
                stream_chunk_handler=None # Explicitly None for non-streaming
            )
            # user_conversations[user_id] = updated_history # History now managed within function_calling_loop
            return QueryResponse(result=result, error=error)
        except Exception as e:
            print(f"Error processing non-streaming query for {user_id}: {str(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            return QueryResponse(result="", error=f"Error processing query: {str(e)}")

@app.post("/clear/{user_id_path}") # Changed sender to user_id_path to avoid confusion
async def clear_user_history(user_id_path: str): # user_id_path is raw from URL
    global service_globally_initialized
    if not service_globally_initialized: 
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    try:
        if clear_conversation_history_for_user(user_id): 
            return {"status": "success", "message": f"Conversation history cleared for {user_id}"}
        else: # This path might not be reachable if clear_conversation_history_for_user raises error or always returns True
            return {"status": "warning", "message": f"Cleared in-memory history for {user_id}, but issue with file deletion."}
    except Exception as e:
        return {"status": "error", "message": f"Error clearing history for {user_id}: {str(e)}"}

# --- Admin Endpoints (Modified for User-Scoping where applicable) ---

@app.post("/admin/users/add_server") # Changed path for clarity
async def add_user_server(request: AddServerRequest):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    user_id = sanitize_user_id_for_key(request.user_id) # SANITIZE HERE
    server_config = {
        "command": request.command,
        "args": request.args if request.args is not None else [],
        "env": request.env if request.env is not None else {}
    }
    config_key_to_check = _mcp_config_key(server_config)

    if config_key_to_check in mcp_manager.user_config_to_session.get(user_id, {}):
        return {"status": "warning", "message": f"Server configuration already running or known for user {user_id}."}

    try:
        dynamic_servers_per_user_map = load_dynamic_servers_per_user()
        user_specific_configs = dynamic_servers_per_user_map.get(user_id, [])
        
        is_in_dynamic_json = any(
             _mcp_config_key(ds_conf) == config_key_to_check for ds_conf in user_specific_configs
        )
        
        if not is_in_dynamic_json:
            user_specific_configs.append(server_config)
            dynamic_servers_per_user_map[user_id] = user_specific_configs
            if not save_dynamic_servers_per_user(dynamic_servers_per_user_map):
                print(f"Warning: Failed to save new server config to dynamic_servers.json for user {user_id}: {server_config}")
        
        if await mcp_manager.start_single_server(server_config, user_id=user_id):
            return {"status": "success", "message": f"Server added and started for user {user_id}, configuration saved."}
    except Exception as e:
        print(f"Error in add_user_server endpoint: {str(e)}")
        import traceback; print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/admin/servers/list_all_known", response_model=AvailableServersResponse) # New endpoint for global list
async def list_all_globally_known_servers():
    global mcp_manager, service_globally_initialized, CORE_SERVER_COMMANDS
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")
    
    all_configs_with_owner = mcp_manager.get_all_globally_known_server_configs(CORE_SERVER_COMMANDS)
    server_details_list = []
    for config_dict in all_configs_with_owner:
        config_key = _mcp_config_key(config_dict)
        owner_id = config_dict.get("_owner_user_id") # Present for dynamic user servers
        
        is_running = False
        tools_list = []
        session = None

        if owner_id: # User's dynamic server
            session = mcp_manager.user_config_to_session.get(owner_id, {}).get(config_key)
        else: # Core server
            session = mcp_manager.core_config_to_session.get(config_key)
        
        if session:
            is_running = True
            if owner_id:
                tools_list = mcp_manager.user_session_to_tools.get(owner_id, {}).get(session, [])
            else:
                tools_list = mcp_manager.core_session_to_tools.get(session, [])

        server_details_list.append(ServerDetail(
            config_key=config_key,
            command=config_dict.get("command", "N/A"),
            args=config_dict.get("args", []),
            env=config_dict.get("env"),
            is_running=is_running,
            tools_provided=tools_list,
            owner_user_id=owner_id
        ))
    return AvailableServersResponse(servers=server_details_list)


@app.post("/admin/users/remove_server") # Changed path
async def remove_server_for_user_or_core(request: RemoveServerRequest):
    global mcp_manager, service_globally_initialized, CORE_SERVER_COMMANDS
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id_to_target = sanitize_user_id_for_key(request.user_id) if request.user_id else None # SANITIZE HERE
    server_config_to_remove = {
        "command": request.command,
        "args": request.args if request.args is not None else [],
        "env": request.env if request.env is not None else {}
    }
    config_key_to_remove = _mcp_config_key(server_config_to_remove)
    actions_taken = []

    try:
        if user_id_to_target: # Removing a user's dynamic server
            dynamic_servers_map = load_dynamic_servers_per_user()
            user_configs = dynamic_servers_map.get(user_id_to_target, [])
            original_len = len(user_configs)
            
            # Check if it was in this user's dynamic list
            is_in_user_dynamic_list = any(_mcp_config_key(conf) == config_key_to_remove for conf in user_configs)

            if is_in_user_dynamic_list:
                user_configs = [conf for conf in user_configs if _mcp_config_key(conf) != config_key_to_remove]
                dynamic_servers_map[user_id_to_target] = user_configs
                if not user_configs: # Remove user entry if list becomes empty
                    del dynamic_servers_map[user_id_to_target]
                
                if save_dynamic_servers_per_user(dynamic_servers_map):
                    actions_taken.append(f"Removed from user {user_id_to_target}'s dynamic_servers.json.")
                else:
                    actions_taken.append(f"Failed to save update to dynamic_servers.json for user {user_id_to_target}.")
            
            if mcp_manager.remove_tools_for_server_by_config(server_config_to_remove, user_id=user_id_to_target):
                actions_taken.append(f"De-registered server from active service for user {user_id_to_target}.")
            
            if not actions_taken and not is_in_user_dynamic_list : # And not de-registered by above
                 raise HTTPException(status_code=404, detail=f"Server configuration not found for user {user_id_to_target}.")

        else: # Removing a core server (from being actively run/tools available, not from CORE_SERVER_COMMANDS list)
            is_core_config_defined = any(_mcp_config_key(cs_conf) == config_key_to_remove for cs_conf in CORE_SERVER_COMMANDS)
            if not is_core_config_defined:
                 raise HTTPException(status_code=404, detail="Specified server configuration is not a defined core server.")

            if mcp_manager.remove_tools_for_server_by_config(server_config_to_remove, user_id=None):
                actions_taken.append("De-registered core server from active service (tools removed). Core definition remains.")
            else: # If remove_tools_for_server_by_config returns False, it means it wasn't running.
                actions_taken.append("Core server was not actively running or already de-registered. Core definition remains.")
        
        return {"status": "success", "message": "Server removal processed. " + " ".join(actions_taken)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in remove_server_for_user_or_core endpoint: {str(e)}")
        import traceback; print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# --- User Preference Endpoints ---

@app.get("/users/{user_id_path}/servers/available", response_model=AvailableServersResponse)
async def list_available_servers_for_user(user_id_path: str): # user_id_path is raw from URL
    global mcp_manager, service_globally_initialized, CORE_SERVER_COMMANDS
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    # These are configs the user *could* enable: their own + all core ones
    user_plus_core_configs = mcp_manager.get_all_known_server_configs_for_user(user_id, CORE_SERVER_COMMANDS)
    
    server_details_list = []
    for config_dict in user_plus_core_configs:
        config_key = _mcp_config_key(config_dict)
        is_running = False
        tools_list = []
        
        # Check if it's one of the user's own dynamic servers
        is_users_own_dynamic = False
        if user_id in mcp_manager.user_config_to_session and config_key in mcp_manager.user_config_to_session[user_id]:
            session = mcp_manager.user_config_to_session[user_id][config_key]
            is_running = True
            tools_list = mcp_manager.user_session_to_tools.get(user_id, {}).get(session, [])
            is_users_own_dynamic = True
        
        # Check if it's a core server (and not already processed as user's own if names clash, though unlikely with paths)
        if not is_users_own_dynamic and config_key in mcp_manager.core_config_to_session:
            session = mcp_manager.core_config_to_session[config_key]
            is_running = True # Core servers are either running or not, globally
            tools_list = mcp_manager.core_session_to_tools.get(session, [])

        server_details_list.append(ServerDetail(
            config_key=config_key,
            command=config_dict.get("command", "N/A"),
            args=config_dict.get("args", []),
            env=config_dict.get("env"),
            is_running=is_running,
            tools_provided=tools_list,
            owner_user_id=user_id if is_users_own_dynamic else None # Mark ownership
        ))
    return AvailableServersResponse(servers=server_details_list)

@app.get("/users/{user_id_path}/servers/active", response_model=AvailableServersResponse)
async def list_active_servers_for_user(user_id_path: str): # user_id_path is raw from URL
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id = sanitize_user_id_for_key(user_id_path) # SANITIZE HERE
    active_tools_list_for_user, active_tool_to_session_map_for_user = mcp_manager.get_tools_for_user_query(user_id)
    
    # Map active sessions back to their configurations to build the response
    active_server_details_map: Dict[str, ServerDetail] = {} # config_key -> ServerDetail

    # Process user's own active servers
    user_sessions_active = {s for s in mcp_manager.user_sessions.get(user_id, []) if s in active_tool_to_session_map_for_user.values()}
    for session in user_sessions_active:
        for conf_key, conf_session in mcp_manager.user_config_to_session.get(user_id, {}).items():
            if conf_session == session:
                # Found the config for this active user session
                # Re-fetch the original config dict to get command/args
                all_dynamic_configs = load_dynamic_servers_per_user()
                user_dynamic_list = all_dynamic_configs.get(user_id, [])
                original_config_dict = next((cd for cd in user_dynamic_list if _mcp_config_key(cd) == conf_key), None)
                if original_config_dict:
                    tools_from_this_session = [t.name for t in active_tools_list_for_user if active_tool_to_session_map_for_user.get(t.name) == session]
                    active_server_details_map[conf_key] = ServerDetail(
                        config_key=conf_key,
                        command=original_config_dict.get("command", "N/A"),
                        args=original_config_dict.get("args", []),
                        env=original_config_dict.get("env"),
                        is_running=True,
                        tools_provided=tools_from_this_session,
                        owner_user_id=user_id
                    )
                break
    
    # Process active core servers
    core_sessions_active = {s for s in mcp_manager.core_sessions if s in active_tool_to_session_map_for_user.values()}
    for session in core_sessions_active:
        for conf_key, conf_session in mcp_manager.core_config_to_session.items():
            if conf_session == session:
                # Found the config for this active core session
                original_config_dict = next((cd for cd in CORE_SERVER_COMMANDS if _mcp_config_key(cd) == conf_key), None)
                if original_config_dict:
                    tools_from_this_session = [t.name for t in active_tools_list_for_user if active_tool_to_session_map_for_user.get(t.name) == session]
                    # Avoid adding if a user's server with same config_key took precedence (though rare)
                    if conf_key not in active_server_details_map:
                        active_server_details_map[conf_key] = ServerDetail(
                            config_key=conf_key,
                            command=original_config_dict.get("command", "N/A"),
                            args=original_config_dict.get("args", []),
                            env=original_config_dict.get("env"),
                            is_running=True,
                            tools_provided=tools_from_this_session,
                            owner_user_id=None # Core server
                        )
                break
            
    return AvailableServersResponse(servers=list(active_server_details_map.values()))


# --- Internal MCP Tool Calling Endpoint ---
@app.post("/internal/call_mcp_tool", response_model=QueryResponse) # Using QueryResponse for now, can be more specific
async def route_internal_mcp_tool_call(
    request: InternalToolCallRequest,
    api_key: str = Depends(verify_internal_api_key) # Secure this endpoint
):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized for internal call")
        
    tool_name = request.tool_name
    arguments = request.arguments
    user_id_for_context = sanitize_user_id_for_key(request.user_id_context) if request.user_id_context else None

    target_session: Optional[ClientSession] = None

    # 1. Check core tools
    if tool_name in mcp_manager.core_tool_to_session:
        target_session = mcp_manager.core_tool_to_session[tool_name]
        print(f"Internal Call: Found tool '{tool_name}' in core sessions.")
    
    # 2. If not in core, and user_id_context is provided, check user-specific tools
    elif user_id_for_context and user_id_for_context in mcp_manager.user_tool_to_session:
        if tool_name in mcp_manager.user_tool_to_session[user_id_for_context]:
            target_session = mcp_manager.user_tool_to_session[user_id_for_context][tool_name]
            print(f"Internal Call: Found tool '{tool_name}' in user '{user_id_for_context}' sessions.")

    if not target_session:
        error_msg = f"Tool '{tool_name}' not found for internal call (context user: {user_id_for_context})."
        print(f"Internal Call: {error_msg}")
        return QueryResponse(result="", error=error_msg)

    try:
        if user_id_for_context and 'user_number' not in arguments:
            arguments['user_number'] = user_id_for_context
        
        print(f"Internal Call: Executing tool '{tool_name}' with args: {arguments} for user context: {user_id_for_context}")

        # --- Test for Streaming Tool ---
        if tool_name == "test_streaming_tool":
            print(f"MCP_SERVICE_LOG: Detected call to test_streaming_tool. Attempting to stream results.")
            all_yielded_results_for_test = []
            is_async_iterator = False
            try:
                tool_call_result_or_iterator = await target_session.call_tool(tool_name, arguments=arguments)
                
                # Check if the result is an async iterator
                if hasattr(tool_call_result_or_iterator, '__aiter__') and hasattr(tool_call_result_or_iterator, '__anext__'):
                    is_async_iterator = True
                    print(f"MCP_SERVICE_LOG: test_streaming_tool call_tool returned an ASYNC ITERATOR.")
                    async for item in tool_call_result_or_iterator:
                        print(f"MCP_SERVICE_LOG: Yielded item from test_streaming_tool: {item}")
                        all_yielded_results_for_test.append(item)
                    print(f"MCP_SERVICE_LOG: Finished iterating over test_streaming_tool results.")
                else:
                    print(f"MCP_SERVICE_LOG: test_streaming_tool call_tool returned a SINGLE item (type: {type(tool_call_result_or_iterator)}): {tool_call_result_or_iterator}")
                    all_yielded_results_for_test.append(tool_call_result_or_iterator)

            except Exception as e_stream_test:
                print(f"MCP_SERVICE_LOG: EXCEPTION during test_streaming_tool iteration: {type(e_stream_test).__name__} - {e_stream_test}")
                import traceback
                print(f"MCP_SERVICE_LOG: Traceback for test_streaming_tool exception:\n{traceback.format_exc()}")
                return QueryResponse(result="", error=f"Exception during streaming test: {e_stream_test}")

            # For this test, just return a summary of what was collected
            final_payload_from_test = all_yielded_results_for_test[-1].get("final_payload") if all_yielded_results_for_test and isinstance(all_yielded_results_for_test[-1], dict) else None
            return QueryResponse(
                result=json.dumps({
                    "test_summary": "Streaming test for test_streaming_tool executed.", 
                    "was_iterator": is_async_iterator,
                    "items_received_count": len(all_yielded_results_for_test),
                    "first_item_type": str(type(all_yielded_results_for_test[0])) if all_yielded_results_for_test else None,
                    "last_item_final_payload": final_payload_from_test
                }), 
                error=None
            )
        # --- End Test for Streaming Tool ---

        # Original non-streaming logic for other tools:
        result_from_tool_call = await target_session.call_tool(tool_name, arguments=arguments)
        
        response_result_str = ""
        response_error_str: Optional[str] = None
        actual_tool_payload_dict: Optional[Dict[str, Any]] = None

        if hasattr(result_from_tool_call, 'content') and \
           isinstance(result_from_tool_call.content, list) and \
           len(result_from_tool_call.content) > 0 and \
           hasattr(result_from_tool_call.content[0], 'text') and \
           isinstance(result_from_tool_call.content[0].text, str):
            try:
                actual_tool_payload_dict = json.loads(result_from_tool_call.content[0].text)
                print(f"Internal Call: Extracted payload from TextContent for tool '{tool_name}'.")
            except json.JSONDecodeError as je:
                response_result_str = result_from_tool_call.content[0].text
                print(f"Internal Call: Tool '{tool_name}' content text was not JSON: '{response_result_str[:200]}...'. Error: {je}")
            except Exception as e:
                response_error_str = f"Error processing TextContent from tool '{tool_name}': {str(e)}"
                print(f"Internal Call: {response_error_str}")
        elif isinstance(result_from_tool_call, dict): 
            actual_tool_payload_dict = result_from_tool_call
            print(f"Internal Call: Tool '{tool_name}' directly returned a dictionary.")
        else: 
            response_result_str = str(result_from_tool_call)
            print(f"Internal Call: Tool '{tool_name}' result was not a dict or recognized TextContent structure: '{response_result_str[:200]}...'")

        if actual_tool_payload_dict is not None:
            if "error" in actual_tool_payload_dict: 
                response_error_str = str(actual_tool_payload_dict["error"])
            try:
                response_result_str = json.dumps(actual_tool_payload_dict)
            except TypeError as te: 
                error_detail = f"TypeError when trying to serialize tool payload dictionary to JSON for '{tool_name}': {str(te)}"
                print(f"Internal Call: {error_detail}")
                if not response_error_str: 
                    response_error_str = error_detail
                if response_result_str == "" and actual_tool_payload_dict is not None: 
                     response_result_str = str(actual_tool_payload_dict) 
        
        print(f"Internal Call: Tool '{tool_name}' executed. Final result string for QueryResponse: '{response_result_str[:200]}...', Error: {response_error_str}")
        return QueryResponse(result=response_result_str, error=response_error_str)

    except Exception as e:
        error_msg = f"Error executing tool '{tool_name}' internally: {str(e)}"
        print(f"Internal Call: {error_msg}")
        import traceback
        print(f"Internal Call Traceback: {traceback.format_exc()}")
        return QueryResponse(result="", error=error_msg)

@app.post("/analyze_images")
async def public_analyze_images(
    urls: list = Body(...),
    analysis_prompt: str = Body("Describe this image in detail."),
    sender: str = Body("public_user")
):
    global mcp_manager, service_globally_initialized
    if not service_globally_initialized or not mcp_manager or not mcp_manager.initialized:
        raise HTTPException(status_code=503, detail="MCP service not initialized")

    user_id = sanitize_user_id_for_key(sender)
    tools, tool_to_session = mcp_manager.get_tools_for_user_query(user_id)
    tool_names = [t.name for t in tools]
    if "analyze_images" not in tool_names:
        raise HTTPException(status_code=404, detail="analyze_images tool not available")

    session = tool_to_session["analyze_images"]
    arguments = {"urls": urls, "analysis_prompt": analysis_prompt}
    try:
        result = await session.call_tool("analyze_images", arguments=arguments)
        # Try to extract JSON result
        if hasattr(result, 'content') and isinstance(result.content, list) and hasattr(result.content[0], 'text'):
            import json
            return json.loads(result.content[0].text)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calling analyze_images: {e}")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    # Set reload to False for production or when dealing with complex async lifespans
    # uvicorn.run("mcp_service:app", host="0.0.0.0", port=port, reload=True) # For dev
    uvicorn.run(app, host="0.0.0.0", port=port)
