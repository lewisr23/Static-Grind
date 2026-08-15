/**
 * Send a prompt to the backend, get back effect parameters from Ollama.
 * @param {string} prompt
 * @returns {Promise<object>} parsed effect params
 */
export async function interpretPrompt(prompt) {
  const formData = new FormData()
  formData.append('prompt', prompt)

  const res = await fetch('/api/glitch', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) throw new Error(`Backend error: ${res.status}`)

  const job = await res.json()

  if (job.status === 'FAILED') {
    throw new Error(job.errorMessage || 'Ollama interpretation failed')
  }

  return JSON.parse(job.effectParams)
}
