import os
import stat
import sys

def check():
    res = {}
    for fd, name in [(0, "stdin"), (1, "stdout"), (2, "stderr")]:
        try:
            st = os.fstat(fd)
            mode = st.st_mode
            res[name] = {
                "fd": fd,
                "mode": mode,
                "ISFIFO": stat.S_ISFIFO(mode),
                "ISSOCK": stat.S_ISSOCK(mode),
                "ISCHR": stat.S_ISCHR(mode),
                "ISREG": stat.S_ISREG(mode),
                "st_size": st.st_size
            }
        except Exception as e:
            res[name] = {"error": str(e)}
            
    with open("/Users/chris/Development/zotero-hermes/fd_info.json", "w") as f:
        import json
        json.dump(res, f, indent=2)

if __name__ == "__main__":
    check()
