# Zentinel Demo
# Run: vhs demo.tape

Output demo.gif
Output demo.webm

Set FontFamily "GeistMono Nerd Font"
Set FontSize 15
Set Width 900
Set Height 520
Set Theme "Catppuccin Mocha"
Set Padding 20
Set TypingSpeed 40ms
Set CursorBlink false

# Prepend fake binaries to PATH
Hide
Type "export PATH=$PWD/bin:$PATH"
Enter
Type "clear"
Enter
Show
Sleep 500ms

# --- Install ---

Type "# Install Zentinel"
Enter
Sleep 500ms

Type "curl -fsSL https://get.zentinelproxy.io | sh"
Enter
Sleep 2s

# --- Version check ---

Hide
Type "clear"
Enter
Show
Sleep 300ms

Type "zentinel --version"
Enter
Sleep 1.5s

# --- Show config ---

Hide
Type "clear"
Enter
Show
Sleep 300ms

Type "# Write a minimal config"
Enter
Sleep 500ms

Type "cat zentinel.kdl"
Enter
Sleep 2.5s

# --- Validate ---

Hide
Type "clear"
Enter
Show
Sleep 300ms

Type "# Validate the config"
Enter
Sleep 500ms

Type "zentinel test -c zentinel.kdl"
Enter
Sleep 1.5s

# --- Start proxy ---

Hide
Type "clear"
Enter
Show
Sleep 300ms

Type "# Start the proxy"
Enter
Sleep 500ms

Type "zentinel run -c zentinel.kdl &"
Enter
Sleep 2s

# --- Send traffic ---

Hide
Type "clear"
Enter
Show
Sleep 300ms

Type "# Send a request through the proxy"
Enter
Sleep 500ms

Type "curl -s http://localhost:8080/api/health | jq"
Enter
Sleep 3s
