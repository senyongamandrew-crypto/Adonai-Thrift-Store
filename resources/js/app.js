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
 *  - [data-add-to-cart]                                      add a piece to the bag
 *  - [data-bag-summary] / [data-bag-list] / [data-bag-total] the basket itself
 *  - [data-bag-fields] / [data-bag-added]                    carrying it to checkout
 *  - [data-toggle-password]                                  password visibility
 *  - [data-cookie-banner] / [data-cookie-accept]             cookie notice
 *  - [data-checkout-form] / [data-checkout-field]           checkout validation
 *  - [data-checkout-error] / [data-checkout-group]           checkout messages
 *  - [data-photo-input] / [data-photo-preview]               shop tools: photo
 *  - [data-confirm]                                          shop tools: ask first
 */

const CONSENT_COOKIE = 'adonai_cookie_consent'
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

document.addEventListener('DOMContentLoaded', () => {
  setupBag()
  setupCookieBanner()
  setupSearch()
  setupInteractions()
  setupCheckout()
  setupPhotoPicker()
  setupConfirmations()
})

function queryAll(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector))
}

/* -------------------------------------------------------------------------- */
/* Bag                                                                          */
/* -------------------------------------------------------------------------- */

/*
 * The bag is what turns "somebody ordered" into a basket the shop can see. The
 * pieces a customer picks are kept on their own phone (localStorage) and posted
 * with the checkout form, so the order reaches the POS queue with its lines
 * rather than empty. Prices are never trusted from here — the server looks each
 * one up again before the order is saved.
 *
 * If the phone refuses storage (private mode, storage switched off) the bag stays
 * empty and checkout still works exactly as it did before.
 */

const BAG_KEY = 'adonai:bag'

function readBag() {
  try {
    const raw = window.localStorage.getItem(BAG_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((line) => line && typeof line.productId === 'string' && line.productId)
      : []
  } catch {
    return []
  }
}

function writeBag(lines) {
  try {
    window.localStorage.setItem(BAG_KEY, JSON.stringify(lines))
  } catch {
    /* Nothing to do: the shop still receives the order and the delivery details. */
  }
  syncBagCount()
  renderBag(lines)
}

function bagSize(lines) {
  return lines.reduce((total, line) => total + (Number(line.quantity) || 1), 0)
}

function setupBag() {
  /*
   * The basket is emptied on the page that confirms the order, not when the form
   * is sent: a checkout that fails validation comes straight back with the pieces
   * still in the basket, so a customer never has to pick them again.
   */
  if (window.location.pathname.startsWith('/orders/')) {
    try {
      window.localStorage.removeItem(BAG_KEY)
    } catch {
      /* ignore */
    }
  }

  const lines = readBag()
  syncBagCount()
  renderBag(lines)
}

function syncBagCount() {
  const count = bagSize(readBag())
  queryAll('#adonai-bag-count').forEach((element) => {
    element.textContent = String(count)
  })
}

/**
 * Add the piece whose button was tapped.
 *
 * Everything one-of-a-kind is stock of one, so tapping twice does not make two:
 * the line is already there and the count stays honest.
 */
function addToBag(button) {
  const productId = button.dataset.addToCart
  if (!productId) return

  const lines = readBag()
  if (!lines.some((line) => line.productId === productId)) {
    lines.push({
      productId,
      name: button.dataset.addName || 'Piece',
      price: Number(button.dataset.addPrice) || 0,
      image: button.dataset.addImage || '',
      quantity: 1,
    })
  }

  writeBag(lines)
  confirmAdded(button)
}

function removeFromBag(productId) {
  writeBag(readBag().filter((line) => line.productId !== productId))
}

/** A quiet confirmation beside the button, with the way to checkout in it. */
function confirmAdded(button) {
  const note = button.parentElement?.querySelector('[data-bag-added]')
  if (!note) return

  note.hidden = false
  note.textContent = ''
  note.append('Added to your bag. ')

  const link = document.createElement('a')
  link.href = '/checkout'
  link.className = 'font-extrabold text-adonai-primary underline'
  link.textContent = 'Go to checkout'
  note.append(link)
}

function money(amount) {
  try {
    return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)
  } catch {
    return String(Math.round(amount))
  }
}

/**
 * Draw the basket: the customer's summary on the checkout page, and the hidden
 * fields that carry it to the server. Both come from the same list, so what the
 * customer reads and what the shop receives cannot disagree.
 */
function renderBag(lines = readBag()) {
  const summary = document.querySelector('[data-bag-summary]')
  const list = document.querySelector('[data-bag-list]')
  const totalLine = document.querySelector('[data-bag-total]')
  const fields = document.querySelector('[data-bag-fields]')
  if (!summary && !fields) return

  if (list) list.textContent = ''
  if (fields) fields.textContent = ''

  if (!lines.length) {
    if (summary) summary.hidden = true
    return
  }

  if (summary) summary.hidden = false

  if (list) {
    lines.forEach((line) => {
      const item = document.createElement('li')
      item.className = 'flex items-center gap-3 rounded-lg border border-adonai-line bg-white p-3'

      if (line.image) {
        const image = document.createElement('img')
        image.src = line.image
        image.alt = ''
        image.className = 'h-12 w-12 rounded-md border border-adonai-line object-cover'
        item.append(image)
      }

      const text = document.createElement('div')
      text.className = 'min-w-0 flex-1'

      const name = document.createElement('p')
      name.className = 'truncate text-sm font-bold text-adonai-ink'
      name.textContent = line.name

      const price = document.createElement('p')
      price.className = 'mt-1 text-xs text-adonai-muted'
      price.textContent = `UGX ${money(line.price)}`

      text.append(name, price)

      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'shrink-0 text-xs font-bold text-adonai-primary underline'
      remove.textContent = 'Remove'
      remove.addEventListener('click', () => removeFromBag(line.productId))

      item.append(text, remove)
      list.append(item)
    })
  }

  if (totalLine) {
    const total = lines.reduce(
      (sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 1),
      0
    )
    totalLine.textContent = `Pieces subtotal: UGX ${money(total)}. The store confirms the delivery fee with you.`
  }

  if (fields) {
    /*
     * Indexed names, not JSON: the checkout form is a plain urlencoded post, and
     * the validator expects a list of pieces each with a productId and a quantity.
     */
    lines.forEach((line, index) => {
      fields.append(
        hiddenField(`items[${index}][productId]`, line.productId),
        hiddenField(`items[${index}][quantity]`, String(line.quantity || 1))
      )
    })
  }
}

function hiddenField(name, value) {
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = name
  input.value = value
  return input
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
/* Checkout: the warning clears as soon as the field is right                  */
/* -------------------------------------------------------------------------- */

/**
 * The rules, and the sentence each one breaks. They mirror the checks the server
 * makes (see app/validators/storefront.ts) so the customer is told the same
 * thing in the same words whether the browser or the server caught it.
 *
 * optional() fields are only checked when something has been typed, so leaving
 * an optional box empty is never an error.
 */
const CHECKOUT_RULES = {
  name: {
    message: 'Enter the full name of the person receiving the pieces.',
    valid: (value) => value.trim().length >= 2,
  },
  phone: {
    message: 'Enter a phone number we can call, for example 0748 992 964.',
    valid: (value) => /^\+?[0-9][0-9\s().-]{6,22}$/.test(value.trim()),
  },
  email: {
    message:
      'That email address does not look right. Leave it empty if you would rather not give one.',
    valid: (value) => value.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
  },
  address: {
    message: 'Enter the delivery address — a street, a building or a landmark we can find.',
    valid: (value) => value.trim().length >= 5,
  },
  city: {
    message: 'Enter the city or area, for example Kampala.',
    valid: (value) => value.trim().length >= 2,
  },
  note: {
    message: 'That note is a little long — keep it under 300 characters.',
    valid: (value) => value.trim().length <= 300,
  },
  terms: {
    message: 'Tick the box to accept the terms, then place your order.',
    valid: (_value, field) => field.checked === true,
  },
}

function setupCheckout() {
  const form = document.querySelector('[data-checkout-form]')
  if (!form) return

  const fields = queryAll('[data-checkout-field]', form)
  const groups = queryAll('[data-checkout-group]', form)

  const slotFor = (name) => document.querySelector(`[data-checkout-error="${name}"]`)

  function show(name, message) {
    const slot = slotFor(name)
    if (!slot) return
    slot.textContent = message
    slot.hidden = false
  }

  function clear(name) {
    const slot = slotFor(name)
    if (!slot) return
    slot.textContent = ''
    slot.hidden = true
  }

  function isFieldValid(field) {
    const rule = CHECKOUT_RULES[field.dataset.checkoutField]
    if (!rule) return true
    return rule.valid(field.value || '', field)
  }

  /**
   * Re-checks one field and either shows or clears its single red line. Called
   * on every keystroke, so the warning goes the moment the box is filled
   * correctly — the customer is never told the same thing twice.
   */
  function recheck(field) {
    const name = field.dataset.checkoutField
    const rule = CHECKOUT_RULES[name]
    if (!rule) return true
    if (isFieldValid(field)) {
      clear(name)
      return true
    }
    return false
  }

  function recheckGroup(group) {
    const name = group.dataset.checkoutGroup
    const chosen = queryAll('input', group).some((input) => input.checked)
    if (chosen) clear(name)
    return chosen
  }

  fields.forEach((field) => {
    const name = field.dataset.checkoutField
    const type = field.getAttribute('type')
    // Radio buttons and checkboxes report on change; text boxes on every keystroke.
    const events =
      type === 'checkbox' || type === 'radio' ? ['change'] : ['input', 'change', 'blur']
    events.forEach((event) => {
      field.addEventListener(event, () => {
        // Show the problem only once the customer has moved on; while typing, a
        // half-finished address is not a mistake worth shouting about.
        if (event === 'blur' && !isFieldValid(field)) {
          show(name, CHECKOUT_RULES[name].message)
          return
        }
        recheck(field)
      })
    })
  })

  groups.forEach((group) => {
    queryAll('input', group).forEach((input) => {
      input.addEventListener('change', () => {
        clear(group.dataset.checkoutGroup)
      })
    })
  })

  /**
   * The page arrives from the server with its red lines already drawn. Anything
   * that is now correct — because the browser autofilled it, or the customer
   * went back and fixed it — has its line cleared on the spot, before anything
   * is typed again.
   */
  fields.forEach((field) => {
    if (isFieldValid(field)) clear(field.dataset.checkoutField)
  })

  form.addEventListener('submit', (event) => {
    let firstInvalid = null

    fields.forEach((field) => {
      if (isFieldValid(field)) {
        clear(field.dataset.checkoutField)
        return
      }
      show(field.dataset.checkoutField, CHECKOUT_RULES[field.dataset.checkoutField].message)
      if (!firstInvalid) firstInvalid = field
    })

    groups.forEach((group) => {
      if (!recheckGroup(group)) {
        const name = group.dataset.checkoutGroup
        const slot = slotFor(name)
        if (slot) {
          slot.textContent =
            name === 'paymentMethod'
              ? 'Choose Mobile money or Cash on delivery.'
              : 'Please choose an option to carry on.'
          slot.hidden = false
        }
        const firstInput = group.querySelector('input')
        if (!firstInvalid) firstInvalid = firstInput
      }
    })

    if (firstInvalid) {
      event.preventDefault()
      firstInvalid.focus()
      /**
       * scrollIntoView is not in every environment (and is absent in the test
       * harness). Asking whether it is a function first keeps the rest of this
       * handler — above all the preventDefault — from being skipped.
       */
      if (typeof firstInvalid.scrollIntoView === 'function') {
        firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  })
}

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
    const list = form.querySelector('[data-photo-preview-list]')
    const name = form.querySelector('[data-photo-preview-name]')
    const note = form.querySelector('[data-photo-preview-note]')
    const clear = form.querySelector('[data-photo-clear]')
    const limit = Number(input.dataset.photoMaxBytes) || 5 * 1024 * 1024
    const thumbs = []

    input.addEventListener('change', () => {
      const files = Array.from(input.files || [])
      thumbs.forEach((thumb) => URL.revokeObjectURL(thumb))
      thumbs.length = 0
      if (list) list.textContent = ''

      if (!files.length) {
        hide()
        return
      }

      let overLimit = 0
      let total = 0

      files.forEach((file, index) => {
        total += file.size
        if (file.size > limit) overLimit += 1

        if (list && index < 8) {
          const url = URL.createObjectURL(file)
          thumbs.push(url)
          const img = document.createElement('img')
          img.src = url
          // The first photo is the one customers see first, so it is marked.
          img.alt = index === 0 ? 'The first photo — this one leads the listing' : ''
          img.className = 'adonai-photo-thumb !h-16 !w-16'
          list.appendChild(img)
        }
      })

      if (name) {
        name.textContent = files.length === 1 ? files[0].name : `${files.length} photos chosen`
      }
      if (note) {
        note.textContent =
          overLimit > 0
            ? `${overLimit} of these ${overLimit === 1 ? 'is' : 'are'} over the ${Math.round(limit / (1024 * 1024))} MB limit — choose ${overLimit === 1 ? 'a smaller one' : 'smaller ones'}, or set the phone camera to a lower size.`
            : `${describeSize(total)} in total — ready to add.`
        note.classList.toggle('text-adonai-danger', overLimit > 0)
        note.classList.toggle('text-adonai-muted', overLimit === 0)
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
      thumbs.forEach((url) => URL.revokeObjectURL(url))
      thumbs.length = 0
      if (list) list.textContent = ''
      if (preview) preview.hidden = true
    }
  })
}

/** Small photos are described in KB — "0.0 MB" tells the shop nothing. */
function describeSize(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
      addToBag(addToCart)
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
