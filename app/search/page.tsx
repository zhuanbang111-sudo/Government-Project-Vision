"use client";

import React, { useState } from "react";
import Link from "next/link";

interface SearchResult {
  id: number;
  filename: string;
  department: string;
  doc_type: string;
  content: string;
  score: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 状态变量：控制当前在弹窗中展示的文档原文
  const [viewingDoc, setViewingDoc] = useState<SearchResult | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");

      setResults(data);
    } catch (err: any) {
      setError(err.message || "搜索请求异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 text-gray-800">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        
        {/* 页头导航栏 */}
        <div className="flex justify-between items-center border-b border-gray-200 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">语义检索模块</h1>
            <p className="text-xs text-gray-500 mt-1">基于大模型向量理解，即便关键词不一致也能匹配相关公文</p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm transition-colors"
          >
            返回首页 (公文生成)
          </Link>
        </div>

        {/* 检索表单 */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            required
            autoComplete="off"
            placeholder="请输入您要查找的内容，例如：以前写过哪些关于环保或安全检查的公文？"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 border border-gray-300 rounded p-2.5 focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className={`px-6 py-2.5 rounded text-white font-medium text-sm transition-colors ${
              loading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "检索中..." : "语义搜索"}
          </button>
        </form>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm mb-4">
            {error}
          </div>
        )}

        {/* 结果显示区 */}
        {results.length === 0 && !loading ? (
          <p className="text-center text-sm text-gray-400 py-10">请输入语义需求进行智能匹配检索</p>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500">匹配结果 (相似度降序排列)</h2>
            <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
              {results.map((doc) => (
                <div key={doc.id} className="p-4 bg-white hover:bg-gray-50 flex justify-between items-center transition-colors">
                  <div className="space-y-1">
                    <p className="font-semibold text-gray-900 text-sm max-w-lg truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      部门: <span className="text-gray-700 mr-3">{doc.department}</span> 
                      文种: <span className="text-gray-700 mr-3">{doc.doc_type}</span>
                      语义匹配度: <span className="text-blue-600 font-semibold">{Math.round(doc.score * 100)}%</span>
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingDoc(doc)}
                    className="px-3 py-1.5 border border-gray-300 rounded hover:bg-white text-xs text-gray-700 font-medium transition-colors"
                  >
                    阅览原文
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 极简原文阅览弹窗（Modal） */}
      {viewingDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col shadow-lg border">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
              <h3 className="font-bold text-gray-900 truncate max-w-xl">{viewingDoc.filename}</h3>
              <button
                onClick={() => setViewingDoc(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">
                {viewingDoc.content}
              </pre>
            </div>
            <div className="p-4 border-t bg-gray-50 text-right rounded-b-lg">
              <button
                onClick={() => setViewingDoc(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded text-xs font-semibold"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
