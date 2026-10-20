#!/usr/bin/env python3
"""批量提取导游考试真题/模拟题PDF为格式化Markdown"""
import pymupdf
import os
import re

BASE = "/Users/rebellica/Documents/tourguide/A-XM-0029  导游资格考试"
OUT = "/Users/rebellica/Documents/tourguide/格式化题库"

def extract_pdf_text(path):
    doc = pymupdf.open(path)
    text = ""
    for page in doc:
        text += page.get_text() + "\n"
    doc.close()
    return text

def clean_text(text):
    # Remove excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def process_file(pdf_path, out_path):
    text = extract_pdf_text(pdf_path)
    text = clean_text(text)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)
    print(f"  -> {out_path}")

# Collect all exam PDFs to process
pdf_files = []

# 1. 历年真题 (from any of the 4 subject folders, they share the same files)
zhenti_base = os.path.join(BASE, "1.2026导游证笔试+面试备考全套资料（务必订阅，链接持续更新......)", "第一板块-笔试（全国统一）", "26年科目1（政策与法规）", "3.历年真题(16-24年)")
for root, dirs, files in os.walk(zhenti_base):
    for f in files:
        if f.endswith('.pdf') or f.endswith('.doc'):
            pdf_path = os.path.join(root, f)
            # Extract year from parent folder
            year_match = re.search(r'(\d{4})', os.path.basename(root))
            year = year_match.group(1) if year_match else "unknown"
            out_name = f.replace('.pdf', '.md').replace('.doc', '.md')
            out_path = os.path.join(OUT, "历年真题", year, out_name)
            pdf_files.append((pdf_path, out_path))

# 2. 2025考生回忆版真题
recall_base = os.path.join(BASE, "1.2026导游证笔试+面试备考全套资料（务必订阅，链接持续更新......)", "第一板块-笔试（全国统一）", "25年真题-考生回忆版")
for f in os.listdir(recall_base):
    if f.endswith('.pdf'):
        pdf_path = os.path.join(recall_base, f)
        out_path = os.path.join(OUT, "历年真题", "2025", f.replace('.pdf', '.md'))
        pdf_files.append((pdf_path, out_path))

# 3. 模拟题 (from subject 1 folder)
mock_base = os.path.join(BASE, "1.2026导游证笔试+面试备考全套资料（务必订阅，链接持续更新......)", "第一板块-笔试（全国统一）", "26年科目1（政策与法规）", "6.模拟题")
for f in os.listdir(mock_base):
    if f.endswith('.pdf'):
        pdf_path = os.path.join(mock_base, f)
        out_path = os.path.join(OUT, "模拟题", f.replace('.pdf', '.md'))
        pdf_files.append((pdf_path, out_path))

print(f"共找到 {len(pdf_files)} 个文件需要处理\n")

for pdf_path, out_path in pdf_files:
    try:
        if pdf_path.endswith('.doc'):
            print(f"  [跳过.doc] {os.path.basename(pdf_path)}")
            continue
        process_file(pdf_path, out_path)
    except Exception as e:
        print(f"  [错误] {os.path.basename(pdf_path)}: {e}")

print("\n完成!")
