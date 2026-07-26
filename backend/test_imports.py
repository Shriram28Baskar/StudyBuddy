import time

modules = [
    "services.llm", 
    "services.rag", 
    "services.vectorstore", 
    "services.serp", 
    "services.firebase"
]

for m in modules:
    print(f"Importing {m}...", flush=True)
    start = time.time()
    try:
        __import__(m)
        print(f"Done in {time.time()-start:.2f}s", flush=True)
    except Exception as e:
        print(f"Error: {e}", flush=True)

print("All done!", flush=True)
