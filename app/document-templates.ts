export const ordinaryDocumentTypes = [
  "工作报告", "情况汇报", "实施方案", "调研报告", "领导讲话稿", "通知", "周报", "请示",
  "通报", "会议纪要", "函", "工作总结", "专项工作报告", "督查检查报告", "整改报告",
] as const;

export type OrdinaryDocumentType = typeof ordinaryDocumentTypes[number];
export type ComponentRequirement = "required" | "recommended" | "optional";

export type OutlineComponentTemplate = {
  key: string;
  name: string;
  description: string;
  requirement: ComponentRequirement;
  defaultSelected: boolean;
  retrievalUses: Array<"structure" | "wording" | "facts" | "policy" | "case" | "format">;
};

export type DocumentTemplate = {
  documentType: OrdinaryDocumentType;
  description: string;
  logic: string;
  subtypes?: string[];
  components: OutlineComponentTemplate[];
};

const c = (
  key: string,
  name: string,
  description: string,
  requirement: ComponentRequirement = "recommended",
  retrievalUses: OutlineComponentTemplate["retrievalUses"] = ["structure", "wording"],
): OutlineComponentTemplate => ({ key, name, description, requirement, defaultSelected: requirement !== "optional", retrievalUses });

export const documentTemplates: Record<OrdinaryDocumentType, DocumentTemplate> = {
  工作报告: { documentType: "工作报告", description: "系统总结工作并部署下一阶段任务", logic: "做法—成效—问题—下一步", components: [
    c("overview", "总体情况", "说明工作背景、总体进展和基本判断", "recommended", ["facts", "structure"]),
    c("actions", "主要工作及措施", "分领域说明已经开展的重点工作", "required", ["facts", "wording"]),
    c("achievements", "重点工作成效", "用事实和数据说明工作成果", "required", ["facts"]),
    c("experience", "特色亮点和经验做法", "提炼具有代表性的机制和经验", "optional", ["case", "wording"]),
    c("problems", "问题与不足", "客观分析短板和困难", "required", ["facts"]),
    c("next_tasks", "下一阶段重点任务", "明确下一阶段目标和工作安排", "required", ["policy", "structure"]),
    c("safeguards", "工作保障", "提出组织、机制和监督保障", "recommended", ["policy", "wording"]),
  ] },
  情况汇报: { documentType: "情况汇报", description: "围绕具体事项反映现状、进展和问题", logic: "情况—进展—问题—请求", components: [
    c("background", "汇报背景与目的", "交代汇报事项的由来和目的"),
    c("situation", "基本情况", "说明事项现状、范围和基本数据", "required", ["facts"]),
    c("progress", "当前工作进展", "说明已经完成和正在推进的工作", "required", ["facts"]),
    c("measures", "已采取的措施", "说明组织推进和问题处置措施", "recommended", ["facts", "wording"]),
    c("problems", "存在问题", "列明当前困难和风险", "required", ["facts"]),
    c("next_steps", "下一步工作安排", "提出后续行动和时间节点", "required", ["structure"]),
    c("coordination", "需要协调解决的事项", "明确需要上级或其他单位支持的事项", "optional", ["facts"]),
  ] },
  实施方案: { documentType: "实施方案", description: "把工作要求转化为可执行任务", logic: "目标—任务—分工—步骤—保障", components: [
    c("basis", "制定背景和工作依据", "引用政策、上级要求和现实需求", "recommended", ["policy"]),
    c("requirements", "总体要求", "明确指导思想和总体方向", "required", ["policy", "wording"]),
    c("principles", "基本原则", "说明实施工作遵循的原则", "optional", ["policy", "structure"]),
    c("objectives", "工作目标", "明确总体目标、阶段目标和指标", "required", ["facts", "policy"]),
    c("tasks", "重点任务", "分项列出具体工作任务", "required", ["policy", "structure"]),
    c("responsibilities", "责任分工", "明确牵头单位、配合单位和职责", "required", ["facts"]),
    c("schedule", "实施步骤与时间安排", "明确阶段、节点和实施路径", "required", ["structure"]),
    c("safeguards", "保障措施", "提出组织、资金、机制和风险保障", "required", ["policy", "wording"]),
    c("assessment", "监督检查与考核评价", "明确监督、验收和评价机制", "recommended", ["policy"]),
  ] },
  调研报告: { documentType: "调研报告", description: "以调查事实为基础分析问题并提出建议", logic: "事实—问题—原因—建议", components: [
    c("background", "调研背景与目的", "说明调研缘起和研究目标", "required", ["policy", "structure"]),
    c("method", "调研范围与方法", "说明对象、范围、方式和资料来源", "recommended", ["facts"]),
    c("status", "基本情况与现状特征", "呈现现状、数据和主要特征", "required", ["facts"]),
    c("achievements", "主要成效", "概括已有工作基础和成效", "optional", ["facts"]),
    c("problems", "突出问题", "归纳调研发现的关键问题", "required", ["facts"]),
    c("causes", "原因分析", "分析制度、机制和执行层面的原因", "required", ["facts", "policy"]),
    c("cases", "经验与案例借鉴", "比较典型地区或项目经验", "optional", ["case"]),
    c("recommendations", "对策建议", "提出与问题相对应的建议", "required", ["policy", "case"]),
    c("conclusion", "调研结论", "形成总体判断和结论", "recommended", ["structure", "wording"]),
  ] },
  领导讲话稿: { documentType: "领导讲话稿", description: "用于会议部署、动员和工作要求", logic: "认识—成绩—部署—责任—号召", components: [
    c("opening", "称谓与开场", "说明会议目的并自然引入主题", "required", ["wording"]),
    c("situation", "形势与总体判断", "分析当前形势和工作要求", "required", ["policy", "facts"]),
    c("achievements", "工作成效与问题", "评价前期工作并点明短板", "recommended", ["facts"]),
    c("importance", "提高思想认识", "阐明工作重要性和紧迫性", "required", ["policy", "wording"]),
    c("deployment", "部署重点工作", "分层次提出重点工作要求", "required", ["policy", "structure"]),
    c("responsibility", "压实责任与作风要求", "明确责任、纪律和落实机制", "required", ["wording"]),
    c("closing", "结尾动员", "形成凝聚共识、推动落实的结尾", "required", ["wording"]),
  ] },
  通知: { documentType: "通知", description: "告知、部署或转发具体事项", logic: "缘由—事项—要求—时限", subtypes: ["工作部署通知", "会议通知", "事项告知通知", "转发或印发通知"], components: [
    c("reason", "发文背景与依据", "说明通知缘由和依据", "recommended", ["policy"]),
    c("matter", "通知事项", "清晰说明通知的核心事项", "required", ["facts"]),
    c("requirements", "执行要求", "说明具体任务和执行标准", "required", ["policy", "structure"]),
    c("deadline", "时间节点", "明确起止时间、完成期限或会议时间", "required", ["facts"]),
    c("submission", "材料报送要求", "说明报送内容、方式和截止时间", "optional", ["format"]),
    c("contact", "联系方式", "提供联系人和咨询渠道", "recommended", ["facts"]),
  ] },
  周报: { documentType: "周报", description: "按周反映工作进度、问题和计划", logic: "本周进展—数据—问题—下周计划", components: [
    c("summary", "本周工作总体情况", "概括本周工作状态", "recommended", ["facts"]),
    c("carryover", "上周遗留事项跟踪", "跟踪上周未完成或风险事项", "optional", ["facts"]),
    c("progress", "重点任务进展", "逐项说明完成情况和状态", "required", ["facts"]),
    c("data", "关键数据和工作成效", "列出可核验的进度和成果数据", "recommended", ["facts"]),
    c("risks", "问题与风险", "说明滞后事项、问题及风险", "required", ["facts"]),
    c("coordination", "需要协调事项", "提出需要协调解决的问题", "optional", ["facts"]),
    c("next_week", "下周工作计划", "明确下周任务、责任和节点", "required", ["structure"]),
  ] },
  请示: { documentType: "请示", description: "就单一事项请求上级指示或批准", logic: "缘由—依据—事项—建议", components: [
    c("reason", "请示缘由", "说明提出请示的必要性", "required", ["facts", "policy"]),
    c("basis", "政策和工作依据", "列明相关政策、规定或上级要求", "recommended", ["policy"]),
    c("situation", "当前情况与困难", "说明事实、问题和现实困难", "required", ["facts"]),
    c("request", "请示事项", "明确提出需要批准或指示的单一事项", "required", ["facts"]),
    c("proposal", "拟实施方案", "说明获批后的实施安排", "recommended", ["structure"]),
    c("closing", "结束语", "使用规范请示结语", "required", ["wording"]),
  ] },
  通报: { documentType: "通报", description: "表彰、批评或传达重要情况", logic: "事实—评价—决定—要求", subtypes: ["表彰通报", "批评通报", "情况通报", "工作进展通报"], components: [
    c("overview", "通报事项概述", "概括通报对象和事项", "required", ["facts"]),
    c("facts", "基本事实", "客观陈述事件或工作情况", "required", ["facts"]),
    c("evaluation", "情况评价", "作出肯定、批评或总体评价", "required", ["wording"]),
    c("decision", "处理或表扬决定", "说明处理、表扬或有关决定", "optional", ["facts", "policy"]),
    c("lessons", "原因与教训", "分析问题原因并提炼教训", "optional", ["facts"]),
    c("requirements", "下一步工作要求", "提出改进和落实要求", "required", ["policy", "wording"]),
  ] },
  会议纪要: { documentType: "会议纪要", description: "记录会议结论和议定事项", logic: "议题—意见—决定—责任—时限", components: [
    c("meeting_info", "会议基本信息", "记录会议时间、地点、主持人和参会范围", "required", ["facts"]),
    c("agenda", "主要议题", "概括会议研究的重点事项", "required", ["facts"]),
    c("opinions", "会议主要意见", "归纳会议形成的总体意见", "recommended", ["wording"]),
    c("decisions", "议定事项", "逐项记录会议决定", "required", ["facts"]),
    c("responsibilities", "责任单位与完成时限", "明确每项任务的责任和节点", "required", ["facts"]),
    c("pending", "待协调事项", "列明尚未形成结论的事项", "optional", ["facts"]),
  ] },
  函: { documentType: "函", description: "用于商洽、询问、答复或征求意见", logic: "缘由—事项—要求—回复", subtypes: ["商洽函", "询问函", "答复函", "征求意见函", "告知函"], components: [
    c("reason", "发函背景", "说明发函缘由和双方关系", "recommended", ["facts"]),
    c("matter", "商洽或答复事项", "清晰表达核心事项", "required", ["facts"]),
    c("explanation", "有关情况说明", "补充事实、依据和必要说明", "optional", ["facts", "policy"]),
    c("request", "具体意见或要求", "说明希望对方办理或反馈的内容", "required", ["wording"]),
    c("deadline", "回复时限与方式", "明确回复期限、方式和联系人", "recommended", ["facts"]),
    c("closing", "结束语", "使用与函件类型相符的规范结语", "required", ["wording"]),
  ] },
  工作总结: { documentType: "工作总结", description: "复盘阶段工作并提炼经验", logic: "任务—做法—成效—经验—不足—计划", components: [
    c("overview", "工作概况", "说明总结周期和总体完成情况", "recommended", ["facts"]),
    c("completion", "主要任务完成情况", "对照任务说明完成情况", "required", ["facts"]),
    c("actions", "主要做法", "总结工作机制和具体措施", "required", ["case", "wording"]),
    c("achievements", "工作成效", "用事实和数据呈现成果", "required", ["facts"]),
    c("experience", "经验与体会", "提炼可复制的规律和经验", "recommended", ["case"]),
    c("problems", "问题与不足", "分析未完成事项和工作短板", "required", ["facts"]),
    c("next_plan", "下一阶段计划", "提出改进方向和后续安排", "required", ["structure"]),
  ] },
  专项工作报告: { documentType: "专项工作报告", description: "围绕某项专项任务完整汇报", logic: "背景—进展—成效—问题—安排", components: [
    c("background", "专项工作背景与目标", "说明专项任务来源和工作目标", "required", ["policy"]),
    c("organization", "组织实施情况", "说明工作机制和组织推进情况", "recommended", ["facts"]),
    c("progress", "重点任务进展", "对照专项任务逐项说明进度", "required", ["facts"]),
    c("achievements", "主要成效与关键数据", "展示专项工作成果", "required", ["facts"]),
    c("experience", "典型经验", "总结专项工作中的有效做法", "optional", ["case"]),
    c("problems", "存在问题与风险", "分析专项工作短板和风险", "required", ["facts"]),
    c("next_steps", "下一步专项安排", "明确后续任务和节点", "required", ["structure"]),
    c("coordination", "需要协调支持事项", "提出需要协调的资源或政策事项", "optional", ["facts", "policy"]),
  ] },
  督查检查报告: { documentType: "督查检查报告", description: "反映检查发现并提出整改要求", logic: "依据—检查—问题—整改—督办", components: [
    c("basis", "督查检查背景与依据", "说明检查任务来源和依据", "required", ["policy"]),
    c("scope", "检查对象、范围和方法", "说明时间、对象、范围和方法", "required", ["facts"]),
    c("overall", "总体情况", "概括工作落实和检查结果", "recommended", ["facts"]),
    c("findings", "发现的主要问题", "逐项列出有证据支撑的问题", "required", ["facts"]),
    c("cases", "典型问题或案例", "列明具有代表性的具体案例", "optional", ["case", "facts"]),
    c("causes", "原因分析", "分析问题产生的原因", "recommended", ["facts", "policy"]),
    c("rectification", "整改意见", "提出与问题对应的整改措施", "required", ["policy"]),
    c("follow_up", "责任时限与跟踪督办", "明确责任单位、整改期限和复查安排", "required", ["facts"]),
  ] },
  整改报告: { documentType: "整改报告", description: "逐项报告问题整改进展和结果", logic: "问题—措施—责任—结果—长效机制", components: [
    c("background", "整改工作背景", "说明问题来源和整改要求", "required", ["policy", "facts"]),
    c("organization", "整改组织情况", "说明责任体系和工作机制", "recommended", ["facts"]),
    c("overall", "整改总体进展", "概括整改完成情况", "required", ["facts"]),
    c("itemized", "问题逐项整改情况", "按问题说明措施、责任、时限和结果", "required", ["facts"]),
    c("unfinished", "未完成事项及原因", "说明尚未完成事项和客观原因", "recommended", ["facts"]),
    c("effect", "整改成效", "说明整改前后变化和实际效果", "required", ["facts"]),
    c("mechanism", "长效机制建设", "说明制度完善和巩固措施", "recommended", ["policy"]),
    c("next_steps", "下一步整改安排", "明确持续整改和复查安排", "required", ["structure"]),
  ] },
};

const subtypeComponents: Record<string, OutlineComponentTemplate[]> = {
  "通知:会议通知": [
    c("purpose", "会议名称与目的", "说明会议主题和召开目的", "required", ["facts"]),
    c("time_place", "会议时间与地点", "明确时间、地点和报到要求", "required", ["facts"]),
    c("attendees", "参会人员", "明确参会范围和人员要求", "required", ["facts"]),
    c("agenda", "会议议程", "列明会议主要议程", "recommended", ["facts", "structure"]),
    c("materials", "材料准备与回执要求", "说明材料、报名和回执要求", "recommended", ["format"]),
    c("notes", "注意事项与联系方式", "说明纪律、交通、食宿和联系方式", "required", ["facts"]),
  ],
  "通知:事项告知通知": [
    c("background", "告知背景", "说明事项背景", "recommended", ["facts"]),
    c("matter", "告知事项", "说明需要公众或有关单位知悉的事项", "required", ["facts"]),
    c("audience", "适用对象", "明确适用范围和对象", "required", ["facts"]),
    c("method", "办理方式与起止时间", "说明办理流程和期限", "required", ["facts"]),
    c("notes", "注意事项与咨询渠道", "说明注意事项和咨询方式", "recommended", ["facts"]),
  ],
  "通知:转发或印发通知": [
    c("document", "转发或印发文件", "明确文件名称和发送范围", "required", ["facts", "format"]),
    c("requirements", "贯彻落实要求", "提出学习、执行和组织要求", "required", ["policy", "wording"]),
    c("feedback", "情况反馈要求", "说明执行情况和材料报送要求", "recommended", ["facts"]),
    c("contact", "联系方式", "提供工作联系人", "optional", ["facts"]),
  ],
  "通报:表彰通报": [
    c("background", "表彰背景", "说明评选或工作背景", "recommended", ["facts"]),
    c("achievements", "先进事迹与工作成效", "说明表彰对象的主要事迹", "required", ["facts", "case"]),
    c("decision", "表彰决定", "明确表彰对象和决定", "required", ["facts"]),
    c("requirements", "学习与工作要求", "号召学习先进并推动工作", "required", ["wording"]),
  ],
  "通报:批评通报": [
    c("facts", "问题事实", "客观说明问题经过和影响", "required", ["facts"]),
    c("causes", "原因与责任", "分析原因和责任", "recommended", ["facts"]),
    c("decision", "处理决定", "说明处理结果", "required", ["facts", "policy"]),
    c("lessons", "教训与整改要求", "提出警示和整改要求", "required", ["policy", "wording"]),
  ],
  "函:答复函": [
    c("reference", "来函确认", "说明收到的来函及事项", "required", ["facts"]),
    c("answer", "答复意见", "逐项明确答复结论", "required", ["facts", "policy"]),
    c("explanation", "有关说明", "说明依据、条件或后续安排", "recommended", ["policy"]),
    c("closing", "结束语", "使用规范答复函结语", "required", ["wording"]),
  ],
  "函:征求意见函": [
    c("background", "征求意见背景", "说明事项背景和依据", "required", ["policy"]),
    c("material", "征求意见内容", "说明需研究反馈的材料或事项", "required", ["facts"]),
    c("requirements", "反馈要求", "明确意见形式、反馈时限和联系人", "required", ["facts", "format"]),
    c("attachments", "附件说明", "列明随函材料", "recommended", ["format"]),
  ],
};

export function getDocumentTemplate(documentType: string, subtype?: string | null): DocumentTemplate {
  const type = ordinaryDocumentTypes.includes(documentType as OrdinaryDocumentType)
    ? documentType as OrdinaryDocumentType : "工作报告";
  const base = documentTemplates[type];
  const override = subtype ? subtypeComponents[`${type}:${subtype}`] : undefined;
  return override ? { ...base, components: override } : base;
}

export function templateComponentsForClient(template: DocumentTemplate) {
  return template.components.map((component, index) => ({ ...component, id: index + 1 }));
}
