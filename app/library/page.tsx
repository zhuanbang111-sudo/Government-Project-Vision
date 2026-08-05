'use client';

import React, { useState, useEffect } from 'react';

interface Document {
  id: string;
  name?: string;      // 兼容可能存在的列名
  filename?: string;  // 兼容真实的 documents.filename
  type: string;
  size: number;
  status: string;
  created_at: string;
  department?: string;
  verified?: number;
  knowledge_type?: string;
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all, document, fact, policy, department_rule, case, template
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [department, setDepartment] = useState('城建处');
  const [classification, setClassification] = useState('document'); // 默认上传分类

  // 1. 获取文档数据
  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/documents');
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error) {
      console.error('获取文档失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchDocuments(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 2. 处理文件上传
  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('department', department);
    formData.append('classification', classification);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setSelectedFile(null);
        const fileInput = document.getElementById('file-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        await fetchDocuments();
      } else {
        alert('上传失败，请重试');
      }
    } catch (error) {
      console.error('上传失败:', error);
      alert('上传过程中发生异常');
    } finally {
      setUploading(false);
    }
  };

  // 3. 删除文件
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该知识资产吗？')) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchDocuments();
      } else {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        alert(payload?.error || '删除失败，请重试');
      }
    } catch (error) {
      console.error('删除失败:', error);
    }
  };

  // 4. 辅助推断：防御性代码，同时对齐 doc.filename 和 doc.name，防止 undefined 引发崩溃
  const getDocumentClassification = (doc: Document): string => {
    if (doc.knowledge_type) return doc.knowledge_type;
    const currentName = doc.filename || doc.name || '';
    const lowerName = currentName.toLowerCase();
    
    if (lowerName.includes('统计') || lowerName.includes('数据') || lowerName.includes('指标') || lowerName.includes('数值')) {
      return 'fact';
    }
    if (lowerName.includes('职责') || lowerName.includes('定岗') || lowerName.includes('编制') || lowerName.includes('管理技术标准')) {
      return 'department_rule';
    }
    if (lowerName.includes('政策') || lowerName.includes('条例') || lowerName.includes('准则') || lowerName.includes('法律') || lowerName.includes('规划')) {
      return 'policy';
    }
    if (lowerName.includes('案例') || lowerName.includes('经验') || lowerName.includes('调研') || lowerName.includes('参考材料')) {
      return 'case';
    }
    if (lowerName.includes('模板') || lowerName.includes('样板') || lowerName.includes('范本')) {
      return 'template';
    }
    return 'document';
  };

  // 5. 计算全新的知识资产中心各项分类数量
  const stats = React.useMemo(() => {
    const total = documents.length;
    let docCount = 0;
    let factCount = 0;
    let policyCount = 0;
    let ruleCount = 0;
    let caseCount = 0;
    let templateCount = 0;

    documents.forEach(doc => {
      const type = getDocumentClassification(doc);
      if (type === 'document') docCount++;
      else if (type === 'fact') factCount++;
      else if (type === 'policy') policyCount++;
      else if (type === 'department_rule') ruleCount++;
      else if (type === 'case') caseCount++;
      else if (type === 'template') templateCount++;
    });

    return { total, docCount, factCount, policyCount, ruleCount, caseCount, templateCount };
  }, [documents]);

  // 6. 根据当前 Tab 和搜索条件对列表进行过滤
  const filteredDocuments = documents.filter((doc) => {
    const currentName = doc.filename || doc.name || '';
    const matchesSearch = currentName.toLowerCase().includes(searchQuery.toLowerCase());
    const docClass = getDocumentClassification(doc);
    
    if (activeTab === 'all') {
      return matchesSearch;
    }
    return matchesSearch && docClass === activeTab;
  });

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">知识资产中心</h1>
          <p className="text-slate-500 mt-1 text-sm">
            统一沉淀并管理公文写作全周期所需的高价值知识资产、事实指标及规范模板。
          </p>
        </div>
      </div>

      {/* 顶部指标卡片 - 展示统一后的六大知识分类 */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-800">知识资产总量</span>
            <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.58 4 8 4s8-1.79 8-4M4 7c0-2.21 3.58-4 8-4s8 1.79 8 4m0 5c0 2.21-3.58 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-2">{stats.total}</div>
          <p className="text-[10px] text-blue-500 mt-1">全局统一沉淀库</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">文档知识数量</span>
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.docCount}</div>
          <p className="text-[10px] text-slate-400 mt-1">通用素材与语料</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">事实知识数量</span>
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.factCount}</div>
          <p className="text-[10px] text-slate-400 mt-1">核心统计与数据指标</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">政策知识数量</span>
            <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.policyCount}</div>
          <p className="text-[10px] text-slate-400 mt-1">政策、法律与规划准则</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">治理规则数量</span>
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.ruleCount}</div>
          <p className="text-[10px] text-slate-400 mt-1">职责规范与定岗条例</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">模板数量</span>
            <svg className="h-4 w-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <div className="text-2xl font-bold text-slate-800 mt-2">{stats.templateCount}</div>
          <p className="text-[10px] text-slate-400 mt-1">公文标准写作模板</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* 左侧：资产快速录入 */}
        <div className="md:col-span-1 bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-fit">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
            <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            资产快速入库
          </h2>
          
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="file-upload" className="text-xs font-semibold text-slate-700">选择文件</label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.txt"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-500 border border-slate-200 rounded-lg cursor-pointer bg-slate-50 focus:outline-none file:mr-2 file:py-2 file:px-3 file:rounded-l-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                required
              />
              <p className="text-[10px] text-slate-400">支持 PDF, Word, Excel, TXT 等格式。</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="department" className="text-xs font-semibold text-slate-700">归属处室</label>
              <input
                id="department"
                type="text"
                autoComplete="organization"
                value={department}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDepartment(e.target.value)}
                placeholder="例如：城建处"
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                required
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="classification" className="text-xs font-semibold text-slate-700">资产分类</label>
              <select
                id="classification"
                value={classification}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setClassification(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="document">通用参考语料 (document)</option>
                <option value="fact">事实数据指标 (fact)</option>
                <option value="policy">政策法律准则 (policy)</option>
                <option value="department_rule">治理规则/职责 (department_rule)</option>
                <option value="case">实践案例 (case)</option>
                <option value="template">标准写作模板 (template)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-xs font-medium hover:bg-blue-700 transition-all disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  正在智能提取中...
                </>
              ) : (
                '录入知识资产'
              )}
            </button>
          </form>
        </div>

        {/* 右侧：统一资产仓库清单 */}
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-4 mb-4">
            <h2 className="text-lg font-bold text-slate-900">资产仓库清单</h2>
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                autoComplete="off"
                placeholder="在库中检索高价值知识资产..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg py-2 pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <svg className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* 自研的高质感 Tab */}
          <div className="flex flex-wrap border-b border-slate-100 mb-4 gap-1">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'all'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              全部资产 ({stats.total})
            </button>
            <button
              onClick={() => setActiveTab('document')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'document'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              文档语料 ({stats.docCount})
            </button>
            <button
              onClick={() => setActiveTab('fact')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'fact'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              事实数据 ({stats.factCount})
            </button>
            <button
              onClick={() => setActiveTab('policy')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'policy'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              政策法规 ({stats.policyCount})
            </button>
            <button
              onClick={() => setActiveTab('department_rule')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'department_rule'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              治理规则 ({stats.ruleCount})
            </button>
            <button
              onClick={() => setActiveTab('case')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'case'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              实践案例 ({stats.caseCount})
            </button>
            <button
              onClick={() => setActiveTab('template')}
              className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                activeTab === 'template'
                  ? 'border-blue-600 text-blue-600 bg-blue-50/20'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              标准模板 ({stats.templateCount})
            </button>
          </div>

          {/* 列表渲染区 */}
          <div>
            {loading ? (
              <div className="flex justify-center items-center py-16 gap-2">
                <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-xs text-slate-500">正在加载高品质知识库...</span>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <svg className="h-8 w-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-slate-400">该分类下尚未检索到有效高价值资产，请录入新知识。</p>
              </div>
            ) : (
              <div className="max-h-120 overflow-y-auto pr-1 space-y-2.5">
                {filteredDocuments.map((doc) => {
                  const currentType = getDocumentClassification(doc);
                  const currentName = doc.filename || doc.name || '未命名资产';
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-3.5 border border-slate-100 rounded-xl hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                        {currentType === 'fact' ? (
                          <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                          </span>
                        ) : currentType === 'department_rule' ? (
                          <span className="p-2.5 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </span>
                        ) : currentType === 'policy' ? (
                          <span className="p-2.5 bg-purple-50 text-purple-600 rounded-lg shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                          </span>
                        ) : currentType === 'case' ? (
                          <span className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </span>
                        ) : currentType === 'template' ? (
                          <span className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                            </svg>
                          </span>
                        ) : (
                          <span className="p-2.5 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </span>
                        )}
                        
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-800 text-xs sm:text-sm truncate">{currentName}</p>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800 uppercase shrink-0">
                              {currentType === 'fact' && '事实数据'}
                              {currentType === 'department_rule' && '治理规则'}
                              {currentType === 'policy' && '政策准则'}
                              {currentType === 'case' && '实践案例'}
                              {currentType === 'template' && '标准模板'}
                              {currentType === 'document' && '参考语料'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 mt-1">
                            <span>大小: {formatSize(doc.size)}</span>
                            <span>•</span>
                            <span>处室: {doc.department || '未分配'}</span>
                            <span>•</span>
                            <span>录入时间: {new Date(doc.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg transition-all shrink-0 ml-2"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
