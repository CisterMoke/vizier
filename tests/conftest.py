import os

os.environ.setdefault("RATE_LIMIT_MAX_REQUESTS", "100000")
os.environ.setdefault("GLOBAL_RATE_LIMIT_MAX_REQUESTS", "1000000")
