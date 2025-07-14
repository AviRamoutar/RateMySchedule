// Main extension state - keeping track of settings and cached data
let extensionEnabled = false;
let schoolId = '';
let schoolName = '';
let professorCache = new Map();
let currentTooltip = null;

// Load user settings when the page loads
chrome.storage.sync.get(['enabled', 'schoolId', 'schoolName'], (data) => {
    extensionEnabled = data.enabled || false;
    schoolId = data.schoolId || '';
    schoolName = data.schoolName || '';

    // Only start if the user has enabled it and selected a school
    if (extensionEnabled && schoolId) {
        startExtension();
    }
});

// Listen for settings changes from the popup
chrome.runtime.onMessage.addListener((request) => {
    if (request.type === 'settingsUpdated') {
        extensionEnabled = request.enabled;
        schoolId = request.schoolId;
        schoolName = request.schoolName;

        if (extensionEnabled && schoolId) {
            startExtension();
        } else {
            stopExtension();
        }
    }
});

function startExtension() {
    createTooltip();
    scanForProfessors();
    watchForChanges();

    // Hidden debug feature - press Alt+D to see what the extension found
    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'd') {
            console.log('RateMySchedule Debug - What we found:');
            console.log('Total professors detected:', document.querySelectorAll('.rmp-professor').length);

            // Show all text we're analyzing
            document.querySelectorAll('td, div, span, p, h1, h2, h3, h4, h5, h6').forEach((element, index) => {
                let text = element.textContent.trim();
                if (text.length > 2 && text.length < 60 && !element.querySelector('*')) {
                    let isProfName = isProfessorName(text);
                    if (isProfName || text.split(' ').length === 2) {
                        console.log(`Text ${index}: "${text}" - Looks like professor: ${isProfName}`);
                    }
                }
            });
        }
    });
}

function stopExtension() {
    removeTooltip();
    removeAllHighlights();
}

function createTooltip() {
    if (!currentTooltip) {
        currentTooltip = document.createElement('div');
        currentTooltip.className = 'rmp-tooltip';
        currentTooltip.style.display = 'none';

        // Let users hover over the tooltip without it disappearing
        currentTooltip.addEventListener('mouseenter', () => {
            currentTooltip.setAttribute('data-hover', 'true');
        });

        currentTooltip.addEventListener('mouseleave', () => {
            currentTooltip.removeAttribute('data-hover');
            hideTooltip();
        });

        document.body.appendChild(currentTooltip);
    }
}

function isMouseOverTooltip() {
    return currentTooltip && currentTooltip.getAttribute('data-hover') === 'true';
}

function removeTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

function scanForProfessors() {
    // Strategy 1: Look for "Instructor" or "Professor" column headers
    let headers = document.querySelectorAll('th, td[class*="header"], .header, [role="columnheader"]');
    let instructorColumnIndex = -1;

    headers.forEach((header, index) => {
        let text = header.textContent.trim().toLowerCase();
        if (text.includes('instructor') || text.includes('professor') ||
            text.includes('teacher') || text.includes('faculty') || text.includes('staff')) {
            // Figure out which column this header represents
            let parentRow = header.parentElement;
            if (parentRow) {
                let cells = Array.from(parentRow.children);
                instructorColumnIndex = cells.indexOf(header) + 1;
            }
        }
    });

    // If we found an instructor column, focus on that
    if (instructorColumnIndex > 0) {
        let instructorCells = document.querySelectorAll(`td:nth-child(${instructorColumnIndex}), td:nth-of-type(${instructorColumnIndex})`);
        instructorCells.forEach(cell => {
            processElement(cell);
        });
    }

    // Strategy 2: Check common table column positions where names usually appear
    let commonColumnSelectors = [
        'td:nth-child(3)', 'td:nth-child(4)', 'td:nth-child(5)', 'td:nth-child(6)',
        'td:nth-of-type(3)', 'td:nth-of-type(4)', 'td:nth-of-type(5)', 'td:nth-of-type(6)'
    ];

    commonColumnSelectors.forEach(selector => {
        let cells = document.querySelectorAll(selector);
        cells.forEach(cell => {
            processElement(cell);
        });
    });

    // Strategy 3: Look for elements that might contain professor names anywhere on the page
    // This catches faculty directory pages, course listings, etc.
    let potentialElements = document.querySelectorAll('td, div, span, p, h1, h2, h3, h4, h5, h6, a, li');
    potentialElements.forEach(element => {
        // Skip if we already processed this element
        if (!element.hasAttribute('data-rmp-processed')) {
            processElement(element);
        }
    });
}

function processElement(element) {
    if (element.hasAttribute('data-rmp-processed')) return;

    let text = element.textContent.trim();

    // Get the actual text we should check - prefer link text if there's a link
    let nameText = '';
    let linkElement = element.querySelector('a');
    if (linkElement) {
        nameText = linkElement.textContent.trim();
    } else {
        nameText = text;
    }

    // Skip elements that contain other elements (unless it's just a simple link)
    let hasComplexContent = element.children.length > 1 ||
        (element.children.length === 1 && !linkElement);

    if (hasComplexContent) return;

    if (isProfessorName(nameText)) {
        makeProfessorClickable(element, nameText);
    }
}

function isProfessorName(text) {
    if (!text || text.length < 2 || text.length > 80) return false;

    // Clean up the text and handle common formatting
    text = text.trim();

    // Remove common titles and suffixes to get the core name
    let cleanText = text
        .replace(/^(Dr\.?|Prof\.?|Professor|Mr\.?|Ms\.?|Mrs\.?|Miss)\s+/i, '')
        .replace(/,?\s+(Ph\.?D\.?|M\.?D\.?|Jr\.?|Sr\.?|III|II|IV)\s*$/i, '')
        .trim();

    let words = cleanText.split(/\s+/);

    // Names should have 1-4 words (first, middle initial/name, last, suffix)
    if (words.length < 1 || words.length > 4) return false;

    // Must contain only letters, spaces, hyphens, apostrophes, and periods
    let hasValidChars = /^[A-Za-z\s\-'\.]+$/.test(cleanText);
    if (!hasValidChars) return false;

    // Exclude obvious non-names (common course/admin terms)
    let excludeList = [
        // Course terms
        'lecture', 'lab', 'discussion', 'seminar', 'workshop', 'tutorial', 'recitation',
        'online', 'remote', 'hybrid', 'synchronous', 'asynchronous',

        // Admin terms
        'staff', 'tba', 'tbd', 'pending', 'arranged', 'cancelled', 'closed', 'waitlist',

        // Locations
        'campus', 'building', 'room', 'hall', 'center', 'north', 'south', 'east', 'west',
        'main', 'location', 'classroom', 'auditorium', 'library', 'gymnasium',

        // Course components
        'component', 'section', 'seats', 'credits', 'units', 'hours',
        'open', 'full', 'available', 'enrollment', 'capacity',

        // General terms
        'instructor', 'professor', 'teacher', 'faculty', 'department', 'college',
        'university', 'course', 'class', 'subject', 'program', 'degree',

        // Days/Times
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'morning', 'afternoon', 'evening', 'night'
    ];

    let textLower = cleanText.toLowerCase();
    let isExcluded = excludeList.some(term => {
        return textLower === term || textLower.includes(term);
    });

    if (isExcluded) return false;

    // Check if it has characteristics of a name
    let hasCapitalLetter = /[A-Z]/.test(cleanText);

    // For single words, be more restrictive - should look like a last name
    if (words.length === 1) {
        return hasCapitalLetter && cleanText.length >= 3 &&
            /^[A-Z][a-z]+$/.test(cleanText) &&
            !excludeList.includes(textLower);
    }

    // For multiple words, check if they look like name parts
    let looksLikeName = words.every(word => {
        // Each word should start with capital or be a middle initial
        return /^[A-Z]/.test(word) &&
            (word.length === 1 || /^[A-Z][a-z]+$/.test(word) || word.match(/^[A-Z]\.$/));
    });

    return hasCapitalLetter && looksLikeName;
}

function makeProfessorClickable(element, professorName) {
    element.setAttribute('data-rmp-processed', 'true');
    element.classList.add('rmp-professor');

    // Make it clear this is clickable
    if (!element.style.cursor) {
        element.style.cursor = 'pointer';
    }

    let hideTimeout;

    element.addEventListener('mouseenter', (e) => {
        clearTimeout(hideTimeout);
        e.stopPropagation();
        showProfessorRating(e, professorName);
    });

    element.addEventListener('mouseleave', (e) => {
        e.stopPropagation();
        // Give users time to move their mouse to the tooltip
        hideTimeout = setTimeout(() => {
            if (!isMouseOverTooltip()) {
                hideTooltip();
            }
        }, 300);
    });
}

function removeAllHighlights() {
    document.querySelectorAll('.rmp-professor').forEach(element => {
        element.classList.remove('rmp-professor');
        element.removeAttribute('data-rmp-processed');
        element.style.cursor = '';
    });
}

function showProfessorRating(event, professorName) {
    // Debug log
    console.log('RateMySchedule: Showing rating for', professorName);

    let rect = event.target.getBoundingClientRect();

    // Smart tooltip positioning - avoid going off screen
    let tooltipX = rect.left + window.scrollX;
    let tooltipY = rect.bottom + window.scrollY + 8;

    // Keep tooltip on screen horizontally
    if (tooltipX + 320 > window.innerWidth + window.scrollX) {
        tooltipX = window.innerWidth + window.scrollX - 330;
    }
    if (tooltipX < window.scrollX + 10) {
        tooltipX = window.scrollX + 10;
    }

    // If tooltip would go below the fold, show it above the element instead
    if (tooltipY + 200 > window.innerHeight + window.scrollY) {
        tooltipY = rect.top + window.scrollY - 210;
    }

    currentTooltip.style.left = tooltipX + 'px';
    currentTooltip.style.top = tooltipY + 'px';
    currentTooltip.style.display = 'block';
    currentTooltip.style.zIndex = '999999';

    // Show cached data immediately, or fetch new data
    if (professorCache.has(professorName)) {
        console.log('RateMySchedule: Using cached data for', professorName);
        displayRating(professorCache.get(professorName));
    } else {
        console.log('RateMySchedule: Fetching data for', professorName);
        currentTooltip.innerHTML = '<div class="loading">Looking up professor ratings...</div>';
        fetchProfessorRating(professorName);
    }
}

function hideTooltip() {
    if (currentTooltip) {
        currentTooltip.style.display = 'none';
    }
}

function fetchProfessorRating(professorName) {
    console.log('RateMySchedule: Sending message to background script', {
        professorName,
        schoolId,
        schoolName
    });

    chrome.runtime.sendMessage({
        type: 'getProfessorRating',
        professorName: professorName,
        schoolId: schoolId,
        schoolName: schoolName
    }, (response) => {
        console.log('RateMySchedule: Received response', response);

        if (chrome.runtime.lastError) {
            console.error('RateMySchedule: Chrome runtime error', chrome.runtime.lastError);
            displayError(professorName, 'Extension error occurred');
            return;
        }

        if (response && response.success) {
            professorCache.set(professorName, response.data);
            displayRating(response.data);
        } else {
            console.log('RateMySchedule: Professor not found or error', response?.error);
            displayNoRating(professorName);
        }
    });
}

function displayError(professorName, errorMessage) {
    currentTooltip.innerHTML = `
    <div class="rmp-content">
      <div class="professor-name">${professorName}</div>
      <div class="no-rating">
        <p>Error loading ratings</p>
        <p class="no-rating-help">${errorMessage}</p>
      </div>
      <a href="https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(professorName)}" 
         target="_blank" 
         class="view-profile">
        Search RateMyProfessors →
      </a>
    </div>
  `;
}

function displayRating(data) {
    let ratingColor = getRatingColor(data.avgRating);
    let difficultyColor = getDifficultyColor(data.avgDifficulty);

    currentTooltip.innerHTML = `
    <div class="rmp-content">
      <div class="professor-header">
        <div class="professor-name">${data.firstName} ${data.lastName}</div>
        <div class="department">${data.department || 'Department not listed'}</div>
      </div>
      
      <div class="ratings-row">
        <div class="rating-box" style="background: ${ratingColor}">
          <div class="rating-number">${data.avgRating}</div>
          <div class="rating-label">Quality</div>
        </div>
        
        <div class="rating-box" style="background: ${difficultyColor}">
          <div class="rating-number">${data.avgDifficulty}</div>
          <div class="rating-label">Difficulty</div>
        </div>
        
        <div class="rating-box secondary">
          <div class="rating-number">${data.wouldTakeAgainPercent}%</div>
          <div class="rating-label">Would Take Again</div>
        </div>
      </div>
      
      <div class="total-ratings">Based on ${data.numRatings} student reviews</div>
      
      <a href="https://www.ratemyprofessors.com/professor/${data.legacyId}" 
         target="_blank" 
         class="view-profile">
        View Full Profile →
      </a>
    </div>
  `;
}

function displayNoRating(professorName) {
    currentTooltip.innerHTML = `
    <div class="rmp-content">
      <div class="professor-name">${professorName}</div>
      <div class="no-rating">
        <p>No ratings found for this professor</p>
        <p class="no-rating-help">They might be new, teach at a different campus, or haven't been rated yet.</p>
      </div>
      <a href="https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(professorName)}" 
         target="_blank" 
         class="view-profile">
        Search RateMyProfessors →
      </a>
    </div>
  `;
}

// Color coding for ratings - green = good, red = bad
function getRatingColor(rating) {
    if (rating >= 4.0) return '#4CAF50';      // Green - Excellent
    if (rating >= 3.0) return '#FFC107';      // Yellow - Good
    if (rating >= 2.0) return '#FF9800';      // Orange - Fair
    return '#F44336';                         // Red - Poor
}

// Color coding for difficulty - green = easy, red = hard
function getDifficultyColor(difficulty) {
    if (difficulty <= 2.5) return '#4CAF50';  // Green - Easy
    if (difficulty <= 3.5) return '#FFC107';  // Yellow - Moderate
    if (difficulty <= 4.0) return '#FF9800';  // Orange - Hard
    return '#F44336';                         // Red - Very Hard
}

function watchForChanges() {
    // Watch for page changes (helpful for single-page applications)
    let observer = new MutationObserver((mutations) => {
        // Don't scan too frequently - wait for changes to settle
        clearTimeout(window.rmpScanTimeout);
        window.rmpScanTimeout = setTimeout(() => {
            scanForProfessors();
        }, 1000);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}