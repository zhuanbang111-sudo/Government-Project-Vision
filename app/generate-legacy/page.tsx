"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function LegacyGeneratePage() {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("");
  const [topic, setTopic] = useState("");
  const [points, setPoints] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !docType || !topic || !points) {
      setError("请完整填写表单并选择文件。");
      return;
    }

    setLoading(true);
    setError(null);
    setResult("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", docType);
    formData.append("topic", topic);
    formData.append("points", points);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "请求失败");
      setResult(data.text);
    } catch (err: any) {
      setError(err.message || "异常");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-sm border">
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <h1 className="text-xl font-bold">单文件上传模式 (MVP 遗留路径)</h1>
          <Link href="/" className="text-sm text-gray-600 hover:underline">返回首页</Link>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1">上传历史公文 (.docx 格式)</label>
            <input type="file" accept=".docx" onChange={handleFileChange} className="block w-full border text-sm rounded p-1" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">公文文种</label>
            <input type="text" autoComplete="off" value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">新公文主题</label>
            <input type="text" autoComplete="off" value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full border rounded p-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">核心要点</label>
            <textarea rows={4} value={points} onChange={(e) => setPoints(e.target.value)} className="w-full border rounded p-2 text-sm" />
          </div>
          {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded">{error}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
            {loading ? "生成中..." : "开始生成"}
          </button>
        </form>
        {result && (
          <div className="mt-8 border-t pt-6">
            <h2 className="font-semibold mb-2">生成结果：</h2>
            <div className="p-4 bg-gray-50 border rounded"><pre className="whitespace-pre-wrap text-sm">{result}</pre></div>
          </div>
        )}
      </div>
    </main>
  );
}
