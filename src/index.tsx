import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  OPENAI_API_KEY: string
  OPENAI_BASE_URL: string
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS
app.use('/api/*', cors())

// 정적 에셋 (이미지 등)
app.use('/images/*', serveStatic({ root: './public' }))
app.use('/static/*', serveStatic({ root: './public' }))

// ── API: 브랜드 보이스 분석 ──
app.post('/api/analyze', async (c) => {
  const { samples } = await c.req.json<{ samples: string }>()

  if (!samples || samples.trim().length < 20) {
    return c.json({ error: '텍스트 샘플을 더 입력해주세요 (20자 이상)' }, 400)
  }

  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  const systemPrompt = `당신은 브랜드 언어 분석 전문가입니다.
주어진 텍스트 샘플을 분석하여 다음 JSON 형식으로 정확하게 반환하세요.
다른 텍스트 없이 JSON만 반환하세요.

{
  "tone": ["톤 키워드 3~5개"],
  "keywords": ["핵심 단어/표현 5~7개"],
  "sentence_pattern": "문장 구조 특징 1~2문장",
  "avoid": ["쓰지 않는 표현 3~4개"],
  "personality": "브랜드 인격을 한 문장으로",
  "summary": "이 브랜드의 보이스를 2~3문장으로 요약"
}`

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `다음 브랜드 텍스트 샘플을 분석해주세요:\n\n${samples}` }
        ],
        temperature: 0.3
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json({ error: `AI 요청 실패: ${err}` }, 500)
    }

    const data = await response.json() as any
    const content = data.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return c.json({ error: '분석 결과를 파싱할 수 없습니다', raw: content }, 500)
    }

    const analysis = JSON.parse(jsonMatch[0])
    return c.json({ success: true, analysis })

  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ── API: 브랜드 보이스로 콘텐츠 변환 ──
app.post('/api/transform', async (c) => {
  const { analysis, context, customContext } = await c.req.json<{
    analysis: any
    context: string
    customContext?: string
  }>()

  if (!analysis || !context) {
    return c.json({ error: '분석 결과와 변환 맥락이 필요합니다' }, 400)
  }

  const apiKey = c.env.OPENAI_API_KEY
  const baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'

  const contextMap: Record<string, string> = {
    job_posting: '채용 공고 (JD)',
    product_desc: '제품/서비스 소개',
    sns_caption: 'SNS 캡션 (Instagram)',
    exhibition: '전시 도슨트 설명',
    email: '공식 이메일',
    custom: customContext || '자유 형식'
  }

  const contextLabel = contextMap[context] || context

  const systemPrompt = `당신은 브랜드 카피라이터입니다.
주어진 브랜드 보이스 분석을 바탕으로, 요청한 맥락에 맞는 텍스트를 작성하세요.

반드시 다음 JSON 형식으로만 반환하세요:
{
  "output": "작성된 텍스트 (200~400자)",
  "consistency_points": ["보이스 일관성 근거 3가지"],
  "context_label": "${contextLabel}"
}`

  const userPrompt = `브랜드 보이스 분석:
- 톤: ${analysis.tone?.join(', ')}
- 핵심 키워드: ${analysis.keywords?.join(', ')}
- 문장 패턴: ${analysis.sentence_pattern}
- 쓰지 않는 표현: ${analysis.avoid?.join(', ')}
- 브랜드 인격: ${analysis.personality}

위 보이스를 유지하면서 "${contextLabel}" 형식의 텍스트를 작성해주세요.`

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7
      })
    })

    if (!response.ok) {
      const err = await response.text()
      return c.json({ error: `AI 요청 실패: ${err}` }, 500)
    }

    const data = await response.json() as any
    const content = data.choices?.[0]?.message?.content || ''

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return c.json({ error: '변환 결과를 파싱할 수 없습니다', raw: content }, 500)
    }

    const result = JSON.parse(jsonMatch[0])
    return c.json({ success: true, result })

  } catch (e: any) {
    return c.json({ error: e.message }, 500)
  }
})

// ── 정적 HTML 파일 fallback ──
app.use('/*', serveStatic({ root: './public' }))

export default app
