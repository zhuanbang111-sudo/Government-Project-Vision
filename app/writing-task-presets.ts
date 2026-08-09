import type { OrdinaryDocumentType } from "./document-templates";

export type PlanningDocumentType = "auto" | OrdinaryDocumentType;

export interface WritingScenario {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export interface WritingTaskPreset {
  topicLabel: string;
  topicPlaceholder: string;
  scenarios: WritingScenario[];
  focusOptions: string[];
}

const scenario = (id: string, name: string, description: string, instruction: string): WritingScenario => ({ id, name, description, instruction });

export const primaryPlanningTypes: PlanningDocumentType[] = ["auto", "工作报告", "情况汇报", "实施方案", "调研报告", "领导讲话稿"];

export const timeRangeOptions = ["本周", "本月", "本季度", "上半年", "全年"];
export const audienceOptions = ["单位领导", "上级主管部门", "部门内部", "专题会议"];

export const writingTaskPresets: Record<PlanningDocumentType, WritingTaskPreset> = {
  auto: {
    topicLabel: "要写的事项",
    topicPlaceholder: "例如：地下管线建设",
    scenarios: [
      scenario("auto-summary", "总结阶段工作", "总结进展并安排下一阶段任务", "总结阶段工作并形成工作报告"),
      scenario("auto-report", "汇报具体事项", "反映现状、进展和协调事项", "围绕具体事项形成情况汇报"),
      scenario("auto-plan", "部署执行任务", "把工作要求转化为实施安排", "围绕任务部署形成实施方案"),
      scenario("auto-research", "分析问题建议", "分析现状、原因并提出建议", "围绕问题研究形成调研报告"),
      scenario("auto-speech", "准备会议讲话", "形成会议部署或动员讲话", "围绕会议主题形成领导讲话稿"),
    ],
    focusOptions: ["工作进展", "主要成效", "问题不足", "下一步安排", "政策依据", "协调事项"],
  },
  工作报告: {
    topicLabel: "工作主题",
    topicPlaceholder: "例如：地下管线建设",
    scenarios: [
      scenario("report-stage", "阶段工作报告", "总结一个阶段的工作进展", "形成阶段工作报告"),
      scenario("report-year", "年度工作报告", "总结全年工作并部署下一年度任务", "形成年度工作报告"),
      scenario("report-special", "专项任务报告", "围绕一项重点任务完整报告", "形成专项工作报告"),
    ],
    focusOptions: ["总体进展", "主要措施", "工作成效", "经验亮点", "问题不足", "下一步任务", "工作保障"],
  },
  情况汇报: {
    topicLabel: "汇报事项",
    topicPlaceholder: "例如：重点项目推进情况",
    scenarios: [
      scenario("brief-progress", "工作进展汇报", "汇报当前进度和后续安排", "汇报当前工作进展"),
      scenario("brief-problem", "问题事项汇报", "重点反映困难和协调请求", "汇报问题事项和协调需求"),
      scenario("brief-emergency", "紧急情况汇报", "快速说明事件、处置和风险", "汇报突发或紧急情况"),
    ],
    focusOptions: ["基本情况", "当前进展", "已采取措施", "存在问题", "风险研判", "协调事项", "下一步安排"],
  },
  实施方案: {
    topicLabel: "实施事项",
    topicPlaceholder: "例如：城市更新专项行动",
    scenarios: [
      scenario("plan-action", "专项行动方案", "部署一项专项行动", "制定专项行动实施方案"),
      scenario("plan-project", "项目实施方案", "明确项目任务、步骤和保障", "制定项目实施方案"),
      scenario("plan-rectify", "整改实施方案", "针对问题安排整改任务", "制定问题整改实施方案"),
    ],
    focusOptions: ["总体要求", "工作目标", "重点任务", "责任分工", "时间节点", "监督考核", "保障措施"],
  },
  调研报告: {
    topicLabel: "调研主题",
    topicPlaceholder: "例如：城市地下空间治理",
    scenarios: [
      scenario("research-policy", "政策专题调研", "分析政策执行现状并提出建议", "开展政策专题调研"),
      scenario("research-problem", "问题导向调研", "围绕突出问题分析原因", "开展问题导向调研"),
      scenario("research-case", "经验比较调研", "比较典型经验并提出本地建议", "开展经验比较调研"),
    ],
    focusOptions: ["现状数据", "突出问题", "原因分析", "政策依据", "典型案例", "外地经验", "对策建议"],
  },
  领导讲话稿: {
    topicLabel: "会议或活动主题",
    topicPlaceholder: "例如：全市安全生产工作会议",
    scenarios: [
      scenario("speech-deploy", "部署讲话", "部署重点工作并压实责任", "形成工作部署讲话稿"),
      scenario("speech-mobilize", "动员讲话", "统一思想并推动行动", "形成动员讲话稿"),
      scenario("speech-summary", "总结讲话", "总结会议并提出落实要求", "形成总结讲话稿"),
    ],
    focusOptions: ["形势判断", "工作成效", "提高认识", "重点部署", "责任要求", "作风纪律", "动员号召"],
  },
  通知: {
    topicLabel: "通知事项",
    topicPlaceholder: "例如：开展安全生产专项检查",
    scenarios: [scenario("notice-work", "工作部署通知", "部署任务、要求和时限", "发布工作部署通知"), scenario("notice-meeting", "会议通知", "明确会议时间、地点和参会人员", "发布会议通知")],
    focusOptions: ["通知缘由", "执行对象", "具体任务", "完成时限", "报送要求", "联系方式"],
  },
  周报: {
    topicLabel: "周报主题",
    topicPlaceholder: "例如：重点项目推进",
    scenarios: [scenario("weekly-normal", "日常工作周报", "汇总本周进展和下周计划", "形成日常工作周报"), scenario("weekly-project", "项目推进周报", "跟踪重点项目状态和风险", "形成项目推进周报")],
    focusOptions: ["本周进展", "关键数据", "问题风险", "协调事项", "下周计划"],
  },
  请示: {
    topicLabel: "请示事项",
    topicPlaceholder: "例如：申请调整项目实施计划",
    scenarios: [scenario("request-approval", "请求批准", "请求上级批准具体事项", "形成请求批准的请示"), scenario("request-guidance", "请求指示", "就疑难事项请求明确意见", "形成请求指示的请示")],
    focusOptions: ["请示缘由", "政策依据", "现实困难", "请示事项", "拟实施方案"],
  },
  通报: {
    topicLabel: "通报事项",
    topicPlaceholder: "例如：重点工作推进情况",
    scenarios: [scenario("bulletin-progress", "情况通报", "传达工作情况和后续要求", "形成情况通报"), scenario("bulletin-praise", "表彰通报", "通报先进事迹并提出学习要求", "形成表彰通报"), scenario("bulletin-criticize", "批评通报", "说明问题事实并提出整改要求", "形成批评通报")],
    focusOptions: ["基本事实", "情况评价", "处理决定", "原因教训", "工作要求"],
  },
  会议纪要: {
    topicLabel: "会议主题",
    topicPlaceholder: "例如：地下管线建设专题协调会",
    scenarios: [scenario("minutes-decision", "议事决策纪要", "记录会议意见和议定事项", "形成议事决策会议纪要"), scenario("minutes-coordinate", "协调会议纪要", "明确协调结论、责任和时限", "形成协调会议纪要")],
    focusOptions: ["会议议题", "主要意见", "议定事项", "责任单位", "完成时限", "待协调事项"],
  },
  函: {
    topicLabel: "发函事项",
    topicPlaceholder: "例如：征求规划方案意见",
    scenarios: [scenario("letter-consult", "商洽函", "就具体事项与有关单位商洽", "形成商洽函"), scenario("letter-opinion", "征求意见函", "发送材料并明确反馈要求", "形成征求意见函"), scenario("letter-reply", "答复函", "对来函事项作出正式答复", "形成答复函")],
    focusOptions: ["发函背景", "核心事项", "政策依据", "具体要求", "反馈时限", "联系方式"],
  },
  工作总结: {
    topicLabel: "总结主题",
    topicPlaceholder: "例如：年度城市建设管理工作",
    scenarios: [scenario("summary-stage", "阶段工作总结", "复盘阶段工作并安排下一步", "形成阶段工作总结"), scenario("summary-year", "年度工作总结", "总结全年工作和经验不足", "形成年度工作总结")],
    focusOptions: ["任务完成", "主要做法", "工作成效", "经验体会", "问题不足", "下一步计划"],
  },
  专项工作报告: {
    topicLabel: "专项工作主题",
    topicPlaceholder: "例如：城镇燃气安全整治",
    scenarios: [scenario("special-progress", "专项进展报告", "报告专项任务进展和成效", "形成专项工作进展报告"), scenario("special-complete", "专项综合报告", "全面报告专项工作实施情况", "形成专项工作综合报告")],
    focusOptions: ["任务背景", "组织实施", "重点进展", "主要成效", "问题风险", "后续安排", "协调事项"],
  },
  督查检查报告: {
    topicLabel: "督查检查事项",
    topicPlaceholder: "例如：安全生产责任落实",
    scenarios: [scenario("inspection-special", "专项检查报告", "报告检查发现和整改要求", "形成专项检查报告"), scenario("inspection-supervise", "督查落实报告", "检查任务落实和责任履行情况", "形成督查落实报告")],
    focusOptions: ["检查依据", "对象范围", "总体情况", "发现问题", "典型案例", "整改意见", "督办时限"],
  },
  整改报告: {
    topicLabel: "整改事项",
    topicPlaceholder: "例如：审计反馈问题整改",
    scenarios: [scenario("rectify-progress", "整改进展报告", "逐项报告当前整改进度", "形成整改进展报告"), scenario("rectify-complete", "整改完成报告", "报告整改结果和长效机制", "形成整改完成报告")],
    focusOptions: ["问题清单", "整改措施", "责任时限", "整改结果", "未完成原因", "长效机制"],
  },
};

export function composeTaskBrief(options: {
  planningType: PlanningDocumentType;
  scenario: WritingScenario;
  topic: string;
  timeRange: string;
  audience: string;
  focuses: string[];
  extra: string;
}) {
  const { planningType, scenario: selectedScenario, topic, timeRange, audience, focuses, extra } = options;
  return [
    planningType === "auto" ? `${selectedScenario.instruction}，主题为“${topic}”` : `${selectedScenario.instruction}，文种明确为${planningType}，主题为“${topic}”`,
    timeRange ? `时间范围为${timeRange}` : "",
    audience ? `报送对象为${audience}` : "",
    focuses.length ? `重点写${focuses.join("、")}` : "",
    extra.trim() ? `其他要求：${extra.trim()}` : "",
  ].filter(Boolean).join("；") + "。";
}
