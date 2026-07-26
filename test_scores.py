
import asyncio
from backend.services.embeddings import embed_query
from backend.services.vectorstore import query_collection, query_image_collection

async def test():
    q = 'Explain everything to know about General Organisation of registers with a diagram'
    e = embed_query(q)
    print('Text Results:')
    res = query_collection('SCSB1301_Unit 1_Notes.pdf', e, top_k=5)
    for doc, meta, score in res:
        p = meta.get('page_num')
        print(f'Score: {score}, Page: {p}, Text: {doc[:100]}...')
        
    print('\nImage Results:')
    ires = query_image_collection('SCSB1301_Unit 1_Notes.pdf_images', e, top_k=5)
    for meta, score in ires:
        path = meta.get('image_path')
        print(f'Score: {score}, Path: {path}')

asyncio.run(test())

