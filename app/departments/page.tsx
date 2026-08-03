"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface DeptFunction {
  id: number;
  department_name: string;
  function_description: string;
  source_file: string;
  created_at: string;
}

export default function DepartmentsPage() {
  const [records, setRecords] = useState<DeptFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/departments");
        if (!res.ok) throw new Error("获取部门职责数据失败");
        const data = await res.json();
        setRecords(data);
      } catch (err: any) {
        setError(err.message || "请求异常");
      } finally {
        setLoading(false);
      }
    };
    fetchRecords();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8 text-gray-800">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        
        {/* 页头导航栏 */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">🏢 部门职能库</h1>
            <p className="text-xs text-gray-500 mt-1">查看自 Excel 表格导入的各部门三定方案与具体职责划分条款</p>
          </div>
          <Link
            href="/"
            className="mt-3 sm:mt-0 px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-sm transition-colors"
          >
            返回首页 (公文生成)
          </Link>
        </div>

        {error && (
          <div className="p-4 mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        {/* 加载与表格展示 */}
        {loading ? (
          <p className="text-center text-sm text-gray-500 py-10">正在调取部门职责数据...</p>
        ) : records.length === 0 ? (
          <p className="text-center text-sm text-gray-500 py-10">部门职能库暂无数据，请向 incoming/ 目录放入 .xlsx 表格文件进行自动提取</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-gray-700 font-medium">
                <tr>
                  <th className="px-6 py-3 text-left w-1/4">部门名称</th>
                  <th className="px-6 py-3 text-left w-1/2">具体职责范围描述</th>
                  <th className="px-6 py-3 text-left w-1/4">数据来源文件</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {records.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                      {item.department_name}
                    </td>
                    <td className="px-6 py-4 text-gray-700 leading-relaxed">
                      {item.function_description}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400 truncate max-w-xs" title={item.source_file}>
                      {item.source_file}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}