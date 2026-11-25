import { db } from '../db'
import { useChild } from '../App'
import { useNow } from '../hooks'
import { ANSWERS, answeredCount, dueFrom, dueSurvey, SURVEYS, type Answer } from '../surveys'

export function Surveys({ month }: { month?: string }) {
  const child = useChild()
  const now = useNow(60_000)
  const due = dueSurvey(child.birthDate, now)
  const survey = SURVEYS.find(s => String(s.month) === month)
  const from = (m: number) => dueFrom(child.birthDate, m)

  if (!survey) return (
    <>
      <h1>Védőnői kérdőívek</h1>
      <p className="muted small">Szülői kérdőív a védőnői szűrővizsgálathoz. A 3 hónapos vizsgálathoz nincs szülői kérdőív.</p>
      <ul className="list">
        {SURVEYS.map(s => (
          <li key={s.month}>
            <a href={`#/surveys/${s.month}`}>
              <span>{s.title}{s === due && <strong> · most esedékes</strong>}</span>
              <span className="muted">{from(s.month)} · {answeredCount(child.surveys?.[s.month])}/{s.questions.length}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )

  const answers = child.surveys?.[survey.month] ?? []
  // modify() reads the stored row, so quick taps don't overwrite each other with a stale copy.
  const set = (i: number, a: Answer) => db.children.where('id').equals(child.id!).modify(c => {
    const list = [...(c.surveys?.[survey.month] ?? [])]
    list[i] = list[i] === a ? null : a // tapping the chosen answer clears it
    c.surveys = { ...c.surveys, [survey.month]: Array.from(list, v => v ?? null) }
  })

  return (
    <>
      <p><a href="#/surveys">← Kérdőívek</a></p>
      <h1>{survey.title}</h1>
      <p className="muted small">{child.name} · esedékes {from(survey.month)}-tól · {answeredCount(answers)}/{survey.questions.length} kitöltve</p>
      <ol className="survey">
        {survey.questions.map(([q, hint], i) => (
          <li key={i} className="card">
            <p>{q}{hint && <small className="muted"> ({hint})</small>}</p>
            <div className="chips" role="radiogroup" aria-label={`${i + 1}. kérdés`}>
              {ANSWERS.map(([v, l]) => (
                <button type="button" key={v} role="radio" aria-checked={answers[i] === v} onClick={() => set(i, v)}>{l}</button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}
