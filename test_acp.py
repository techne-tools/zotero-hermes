import subprocess
import json
import time
import select

def test():
    print("Spawning hermes acp...")
    proc = subprocess.Popen(
        ["/Users/chris/.local/bin/hermes", "acp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    
    # Wait for 12 seconds, printing stderr in real-time
    print("Waiting 12 seconds for startup. Stderr output:")
    start_time = time.time()
    while time.time() - start_time < 12:
        ready = select.select([proc.stderr], [], [], 0.5)
        if ready[0]:
            line = proc.stderr.readline()
            if line:
                print("STDERR:", line.strip())
                
    init_request = {
        "jsonrpc": "2.0",
        "id": "msg_init_test",
        "method": "initialize",
        "params": {
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": {"readTextFile": True, "writeTextFile": True},
                "terminal": True
            },
            "clientInfo": {
                "name": "test-client",
                "version": "0.1.0"
            }
        }
    }
    
    print("Writing initialize request...")
    proc.stdin.write(json.dumps(init_request) + "\n")
    proc.stdin.flush()
    
    print("Reading stdout...")
    # Read response with 5s timeout
    ready = select.select([proc.stdout], [], [], 5)
    if ready[0]:
        line = proc.stdout.readline()
        print("STDOUT RECEIVED:", line.strip())
    else:
        print("STDOUT TIMEOUT (5s)")
        
    print("Checking remaining stderr...")
    ready = select.select([proc.stderr], [], [], 1)
    if ready[0]:
        line = proc.stderr.readline()
        print("STDERR remaining:", line.strip())
        
    proc.kill()

if __name__ == "__main__":
    test()
