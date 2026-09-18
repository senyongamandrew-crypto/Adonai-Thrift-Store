/**
 * Adonai Thrift Store — storefront behaviour
 *
 * A small, dependency-free entry point. Everything is progressive: when
 * JavaScript is unavailable the server-rendered catalog, links and forms
 * keep working.
 *
 * Hooks are opt-in data attributes so that Edge components stay readable:
 *
 *  - [data-adonai-search-form] / [data-adonai-search-input]  catalog filtering
 *  - [data-product-card][data-product-search]                searchable text
 *  - [data-search-empty] / [data-search-status]              result feedback
 *  - [data-option-group] / [data-option-value]               size + colour choice
 *  - [data-carousel] / [data-carousel-slide]                 product gallery
 *  - [data-carousel-direction] / [data-carousel-dot]         gallery controls
 *  - [data-add-to-cart]                                      bag counter
 *  - [data-toggle-password]                                  password visibility
 *  - [data-cookie-banner] / [data-cookie-accept]             cookie notice
 *  - [data-photo-input] / [data-photo-preview]               shop tools: photo
 *  - [data-confirm]                                          shop tools: ask first
 */

const CONSENT_COOKIE = 'adonai_cookie_consent'
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

document.addEventListener('DOMContentLoaded', () => {
  setupBagCount()
  setupCookieBanner()
  setupSearch()
  setupInteractions()
  setupPhotoPicker()
  setupConfirmations()
})

function queryAll(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector))
}

/* -------------------------------------------------------------------------- */
/* Bag counter                                                                 */
/* -------------------------------------------------------------------------- */

function setupBagCount() {
  syncBagCount()
}

function syncBagCount() {
  const count = Number(document.body.dataset.bagCount || 0)
  queryAll('#adonai-bag-count').forEach((element) => {
    element.textContent = String(count)
  })
}

function incrementBagCount() {
  const next = Number(document.body.dataset.bagCount || 0) + 1
  document.body.dataset.bagCount = String(next)
  syncBagCount()
}

/* -------------------------------------------------------------------------- */
/* Cookie notice                                                               */
/* -------------------------------------------------------------------------- */

function setupCookieBanner() {
  const banner = document.querySelector('[data-cookie-banner]')
  if (!banner) return

  if (!hasAcceptedConsent()) banner.hidden = false

  banner.querySelector('[data-cookie-accept]')?.addEventListener('click', () => {
    storeAcceptedConsent()
    banner.hidden = true
  })
}

/**
 * Consent is remembered in a cookie, and mirrored into localStorage because
 * cookies can be blocked outright (private browsing, embedded previews). The
 * banner would otherwise reappear on every single page load.
 */
function hasAcceptedConsent() {
  const inCookie = document.cookie
    .split('; ')
    .some((entry) => entry.startsWith(`${CONSENT_COOKIE}=accepted`))

  if (inCookie) return true

  try {
    return window.localStorage.getItem(CONSENT_COOKIE) === 'accepted'
  } catch {
    return false
  }
}

function storeAcceptedConsent() {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=accepted; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`

  try {
    window.localStorage.setItem(CONSENT_COOKIE, 'accepted')
  } catch {
    // Storage unavailable: the cookie written above remains the record.
  }
}

/* -------------------------------------------------------------------------- */
/* Catalog search                                                              */
/* -------------------------------------------------------------------------- */

function setupSearch() {
  const forms = queryAll('[data-adonai-search-form]')
  const inputs = queryAll('[data-adonai-search-input]')

  /**
   * The home page shows a few curated rows above the full collection. Searching
   * narrows the full collection; the curated rows are there to be browsed, so
   * they are left alone. Pages without a main grid filter every card.
   */
  const gridCards = queryAll('[data-product-grid] [data-product-card]')
  const cards = gridCards.length ? gridCards : queryAll('[data-product-card]')

  if (!forms.length) return

  const emptyState = document.querySelector('[data-search-empty]')
  const status = document.querySelector('[data-search-status]')

  function applySearch(rawQuery, updateUrl = false) {
    const query = String(rawQuery || '')
      .trim()
      .toLowerCase()

    inputs.forEach((input) => {
      input.value = rawQuery || ''
    })

    let matches = 0
    cards.forEach((card) => {
      const haystack = String(card.dataset.productSearch || '').toLowerCase()
      const visible = !query || haystack.includes(query)
      card.classList.toggle('hidden', !visible)
      if (visible) matches += 1
    })

    emptyState?.classList.toggle('hidden', matches !== 0)

    if (status) {
      status.textContent = query ? `${matches} matching item${matches === 1 ? '' : 's'}` : ''
    }

    if (updateUrl) {
      const url = new URL(window.location.href)
      if (query) url.searchParams.set('q', String(rawQuery).trim())
      else url.searchParams.delete('q')
      url.hash = 'collection'
      window.history.replaceState({}, '', url)
    }
  }

  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      applySearch(form.querySelector('[data-adonai-search-input]')?.value || '', true)
      window.location.hash = 'collection'
    })
  })

  inputs.forEach((input) => {
    input.addEventListener('input', () => applySearch(input.value))
  })

  applySearch(new URLSearchParams(window.location.search).get('q') || '')
}

/* -------------------------------------------------------------------------- */
/* Delegated interactions                                                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Shop tools: the photo chosen for a piece                                    */
/* -------------------------------------------------------------------------- */

/**
 * Shows the piece's photo as soon as it is chosen, before anything is sent.
 *
 * A phone camera writes files of several megabytes, and the server refuses
 * anything over the limit. Without this the shop only finds out after filling in
 * the whole form, so the file size is read here and a too-big photo is called
 * out on the spot, while the form is still open.
 */
function setupPhotoPicker() {
  queryAll('[data-photo-input]').forEach((input) => {
    const form = input.closest('form') || document
    const preview = form.querySelector('[data-photo-preview]')
    const image = form.querySelector('[data-photo-preview-image]')
    const name = form.querySelector('[data-photo-preview-name]')
    const note = form.querySelector('[data-photo-preview-note]')
    const clear = form.querySelector('[data-photo-clear]')
    const limit = Number(input.dataset.photoMaxBytes) || 5 * 1024 * 1024

    input.addEventListener('change', () => {
      const file = input.files && input.files[0]
      if (!file) {
        hide()
        return
      }

      const tooBig = file.size > limit
      const allowed = Math.round(limit / (1024 * 1024))
      /** Small photos are described in KB — "0.0 MB" tells the shop nothing. */
      const size =
        file.size < 1024 * 1024
          ? `${Math.max(1, Math.round(file.size / 1024))} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`

      if (image) {
        if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl)
        const url = URL.createObjectURL(file)
        image.dataset.objectUrl = url
        image.src = url
      }
      if (name) name.textContent = file.name
      if (note) {
        note.textContent = tooBig
          ? `This photo is ${size}. The most the website accepts is ${allowed} MB — choose a smaller one, or set the phone camera to a lower size.`
          : `${size} — ready to add.`
        note.classList.toggle('text-adonai-danger', tooBig)
        note.classList.toggle('text-adonai-muted', !tooBig)
      }
      if (preview) preview.hidden = false
    })

    if (clear) {
      clear.addEventListener('click', () => {
        input.value = ''
        hide()
      })
    }

    function hide() {
      if (image && image.dataset.objectUrl) {
        URL.revokeObjectURL(image.dataset.objectUrl)
        delete image.dataset.objectUrl
        image.removeAttribute('src')
      }
      if (preview) preview.hidden = true
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Shop tools: asking before something is destroyed                            */
/* -------------------------------------------------------------------------- */

/**
 * Asks before a form whose action cannot be undone is sent — deleting a piece,
 * or replacing the whole catalogue from a backup.
 *
 * The form carries the question in data-confirm, so the wording sits next to the
 * button it belongs to instead of in a list here. Nothing depends on this: with
 * JavaScript unavailable the form submits exactly as it did before.
 */
function setupConfirmations() {
  document.addEventListener(
    'submit',
    (event) => {
      const form =
        event.target instanceof Element ? event.target.closest('form[data-confirm]') : null
      if (!form) return
      if (!window.confirm(form.dataset.confirm)) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    },
    true
  )
}

function setupInteractions() {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const option = target.closest('[data-option-value]')
    if (option) {
      selectOption(option, option.dataset.optionGroup)
      return
    }

    const direction = target.closest('[data-carousel-direction]')
    if (direction) {
      const carousel = direction.closest('[data-carousel]')
      if (carousel) moveCarousel(carousel, Number(direction.dataset.carouselDirection))
      return
    }

    const dot = target.closest('[data-carousel-dot]')
    if (dot) {
      const carousel = dot.closest('[data-carousel]')
      if (carousel) {
        carousel.dataset.carouselIndex = dot.dataset.carouselDot
        moveCarousel(carousel, 0)
      }
      return
    }

    const addToCart = target.closest('[data-add-to-cart]')
    if (addToCart) {
      document.dispatchEvent(
        new CustomEvent('adonai:add-to-cart', {
          detail: { id: addToCart.dataset.addToCart, quantity: 1 },
        })
      )
      incrementBagCount()
      return
    }

    const toggle = target.closest('[data-toggle-password]')
    if (toggle) {
      togglePassword(toggle)
    }
  })
}

function selectOption(element, group) {
  queryAll(`[data-option-group="${group}"]`).forEach((option) => {
    const isActive = option === element
    option.classList.toggle('border-adonai-primary', isActive)
    option.classList.toggle('bg-adonai-sand', isActive)
    option.setAttribute('aria-pressed', isActive ? 'true' : 'false')
  })
}

function moveCarousel(carousel, step) {
  const slides = queryAll('[data-carousel-slide]', carousel)
  if (!slides.length) return

  const index = (Number(carousel.dataset.carouselIndex || 0) + step + slides.length) % slides.length
  carousel.dataset.carouselIndex = String(index)

  slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === index
    slide.classList.toggle('hidden', !isActive)
    slide.setAttribute('aria-hidden', isActive ? 'false' : 'true')
  })

  queryAll('[data-carousel-dot]', carousel).forEach((dot, dotIndex) => {
    dot.classList.toggle('bg-adonai-primary', dotIndex === index)
    dot.classList.toggle('bg-adonai-line', dotIndex !== index)
  })
}

function togglePassword(button) {
  const input = document.getElementById(button.dataset.togglePassword)
  if (!input) return

  input.type = input.type === 'password' ? 'text' : 'password'
  button.textContent = input.type === 'password' ? 'Show' : 'Hide'
}
