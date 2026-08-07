UPDATE documents
SET document_type = CASE
  WHEN filename LIKE '%讲话%' OR filename LIKE '%致辞%' OR filename LIKE '%发言%' THEN 'speech'
  WHEN filename LIKE '%调研%' OR filename LIKE '%调查研究%' THEN 'research_report'
  WHEN filename LIKE '%实施方案%' OR filename LIKE '%工作方案%' OR filename LIKE '%行动方案%' OR filename LIKE '%行动计划%' THEN 'implementation_plan'
  WHEN filename LIKE '%情况汇报%' OR filename LIKE '%进展情况%' OR filename LIKE '%情况梳理%' THEN 'situation_report'
  WHEN filename LIKE '%条例%' OR filename LIKE '%办法%' OR filename LIKE '%规定%' OR filename LIKE '%意见%' OR filename LIKE '%通知%' OR filename LIKE '%政策%' THEN 'policy'
  WHEN filename LIKE '%工作报告%' OR filename LIKE '%工作总结%' OR filename LIKE '%年度报告%' THEN 'work_report'
  ELSE document_type
END,
usage_tags = CASE
  WHEN (content LIKE '%政策%' OR content LIKE '%条例%' OR content LIKE '%办法%' OR content LIKE '%规定%')
       AND content GLOB '*[0-9]*' THEN '["structure","wording","facts","policy"]'
  WHEN content LIKE '%政策%' OR content LIKE '%条例%' OR content LIKE '%办法%' OR content LIKE '%规定%' THEN '["structure","wording","policy"]'
  WHEN content GLOB '*[0-9]*' THEN '["structure","wording","facts"]'
  WHEN content LIKE '%案例%' OR content LIKE '%经验%' OR content LIKE '%做法%' THEN '["structure","wording","case"]'
  ELSE usage_tags
END,
updated_at = CURRENT_TIMESTAMP
WHERE document_type = 'other' AND usage_tags = '["structure","wording"]';

UPDATE knowledge_assets
SET knowledge_type = COALESCE((SELECT document_type FROM documents WHERE documents.id = knowledge_assets.document_id), knowledge_type),
    metadata = COALESCE((SELECT json_object(
      'usageTags', json(usage_tags),
      'topicTags', json(topic_tags),
      'verificationStatus', verification_status
    ) FROM documents WHERE documents.id = knowledge_assets.document_id), metadata)
WHERE document_id IS NOT NULL;
