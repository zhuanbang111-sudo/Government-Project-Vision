"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { theme } from "../ui-config";

interface StatsData {
  corpusCount: number;
  statsDbCount: number;
  deptFuncCount: number;
  vectorizedTotal: number;
  documentsTotal: number;
  departmentDistribution: { name: string; count: number }[];
  industryDistribution: { name: string; count: number }[];
  docTypeDistribution: { name: string; count: number }[];
  recent7DaysCount: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/library-stats")
      .then((res) => {
        if (!res.ok) throw new Error("获取看板统计数据失败");
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // 辅助渲染百分比纯 CSS 条形图的子组件
  const renderBarChart = (items: { name: string; count: number }[], total: number) => {
    if (!items || items.length === 0) return <p className="text-xs text-slate-400">暂无分布数据</p>;

    return (
      <div className="space-y-2.5">
        {items.map((item, idx) => {
          const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">{item.name}</span>
                <span className="text-slate-500">{item.count} 篇 ({percentage}%)</span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-teal-700 h-full rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className={theme.bgPage}>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* 页头 */}
        <div className={theme.card}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
              <h1 className={theme.title}>📊 语料库整体概览看板</h1>
              <p className="text-xs text-slate-400 mt-1">全局审视本地知识库规模、向量化健康率及元数据多维分布状况</p>
            </div>
            <Link href="/" className={theme.secondaryBtn + " mt-3 sm:mt-0"}>返回工作台首页</Link>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>
        )}

        {loading ? (
          <div className={`${theme.card} py-16 text-center`}>
            <p className="text-sm text-slate-400 animate-pulse">正在聚合计算多维统计指标...</p>
          </div>
        ) : stats && (
          <>
            {/* 核心指标统计大卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* 卡片1：普通语料库 */}
              <div className={`${theme.card} p-5 flex flex-col justify-between`}>
                <span className={theme.muted}>普通参考语料库</span>
                <div className="flex items-baseline space-x-1.5 mt-3">
                  <span className="text-3xl font-extrabold text-slate-900">{stats.corpusCount}</span>
                  <span className="text-xs text-slate-400">篇</span>
                </div>
              </div>

              {/* 卡片2：统计数据库 */}
              <div className={`${theme.card} p-5 flex flex-col justify-between`}>
                <span className={theme.muted}>统计数值数据库</span>
                <div className="flex items-baseline space-x-1.5 mt-3">
                  <span className="text-3xl font-extrabold text-slate-900">{stats.statsDbCount}</span>
                  <span className="text-xs text-slate-400">篇</span>
                </div>
              </div>

              {/* 卡片3：部门职能库 */}
              <div className={`${theme.card} p-5 flex flex-col justify-between`}>
                <span className={theme.muted}>部门职能定岗条款</span>
                <div className="flex items-baseline space-x-1.5 mt-3">
                  <span className="text-3xl font-extrabold text-slate-900">{stats.deptFuncCount}</span>
                  <span className="text-xs text-slate-400">条</span>
                </div>
              </div>

              {/* 卡片4：最近7天增长 */}
              <div className={`${theme.card} p-5 flex flex-col justify-between bg-teal-900 text-white border-none`}>
                <span className="text-xs text-teal-200 font-semibold uppercase tracking-wider">最近 7 天新增库容量</span>
                <div className="flex items-baseline space-x-1.5 mt-3">
                  <span className="text-3xl font-extrabold text-white">+{stats.recent7DaysCount}</span>
                  <span className="text-xs text-teal-300">篇新公文</span>
                </div>
              </div>

            </div>

            {/* 向量化健康率监控横幅 */}
            <div className={theme.card}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">🧬 语义向量化健康状态监控</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    已成功转换并存入特征向量的文档比例。未达 100% 通常说明有扫描版 PDF 或个别 API 网络中断。
                  </p>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="text-xl font-bold text-teal-800">{stats.vectorizedTotal}</span>
                  <span className="text-xs text-slate-400"> / {stats.documentsTotal} 篇已完成向量化</span>
                </div>
              </div>
              <div className="mt-4 w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-700"
                  style={{ width: `${stats.documentsTotal > 0 ? (stats.vectorizedTotal / stats.documentsTotal) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* 多维结构分布网格 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* 维度1：部门分布 */}
              <div className={theme.card}>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b pb-2">🏢 拟定部门分布统计</h4>
                {renderBarChart(stats.departmentDistribution, stats.documentsTotal)}
              </div>

              {/* 维度2：行业分布 */}
              <div className={theme.card}>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b pb-2">🏭 主管行业分布统计</h4>
                {renderBarChart(stats.industryDistribution, stats.documentsTotal)}
              </div>

              {/* 维度3：文种分布 */}
              <div className={theme.card}>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-b pb-2">📄 公文文种分布统计</h4>
                {renderBarChart(stats.docTypeDistribution, stats.documentsTotal)}
              </div>

            </div>
          </>
        )}

      </div>
    </main>
  );
}