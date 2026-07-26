import time

print("Importing io...")
import io
print("Importing os...")
import os
print("Importing re...")
import re
print("Importing uuid...")
import uuid
print("Importing json...")
import json
print("Importing aiofiles...")
import aiofiles
print("Importing pypdf...")
import pypdf
print("Importing FastAPI...")
from fastapi import UploadFile
print("Importing dotenv...")
from dotenv import load_dotenv

print("Importing embeddings...")
from services.embeddings import embed_texts, embed_query

print("Importing vectorstore...")
from services.vectorstore import add_chunks, query_collection, delete_collection

print("All done!")
