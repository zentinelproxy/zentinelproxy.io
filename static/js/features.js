/**
 * Features Page - Search and Filter
 */

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('feature-search');
    const filterTags = document.querySelectorAll('.filter-tag');
    const featureSections = document.querySelectorAll('.feature-section');
    const featureItems = document.querySelectorAll('.feature-item');

    let currentFilter = 'all';
    let currentSearch = '';

    /**
     * Filter features based on category and search query
     */
    function filterFeatures() {
        let visibleCount = 0;

        // Filter sections
        featureSections.forEach(section => {
            const category = section.dataset.category;
            const items = section.querySelectorAll('.feature-item');
            let sectionHasVisible = false;

            // Filter items within this section
            items.forEach(item => {
                const title = item.querySelector('h3').textContent.toLowerCase();
                const description = item.querySelector('.feature-description').textContent.toLowerCase();
                const codeRefs = item.querySelector('.feature-code-ref')?.textContent.toLowerCase() || '';
                const featureList = Array.from(item.querySelectorAll('.feature-list li'))
                    .map(li => li.textContent.toLowerCase())
                    .join(' ');

                const searchText = `${title} ${description} ${codeRefs} ${featureList}`;

                // Check if matches current filter and search
                const matchesFilter = currentFilter === 'all' || category === currentFilter;
                const matchesSearch = currentSearch === '' || searchText.includes(currentSearch);

                if (matchesFilter && matchesSearch) {
                    item.classList.remove('hidden');
                    sectionHasVisible = true;
                    visibleCount++;
                } else {
                    item.classList.add('hidden');
                }
            });

            // Show/hide entire section based on whether it has visible items
            if (sectionHasVisible && (currentFilter === 'all' || category === currentFilter)) {
                section.classList.remove('hidden');
            } else {
                section.classList.add('hidden');
            }
        });

        // Show empty state if no results
        showEmptyState(visibleCount === 0);
    }

    /**
     * Show/hide empty state message
     */
    function showEmptyState(show) {
        let emptyState = document.querySelector('.features-empty');

        if (show && !emptyState) {
            emptyState = document.createElement('div');
            emptyState.className = 'features-empty';
            emptyState.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.3-4.3"/>
                </svg>
                <h3>No features found</h3>
                <p>Try adjusting your search or filter to find what you're looking for.</p>
            `;
            document.querySelector('.features-main .container').appendChild(emptyState);
        } else if (!show && emptyState) {
            emptyState.remove();
        }
    }

    /**
     * Handle search input
     */
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase().trim();
            filterFeatures();
        });
    }

    /**
     * Handle filter tag clicks
     */
    filterTags.forEach(tag => {
        tag.addEventListener('click', () => {
            // Update active state
            filterTags.forEach(t => t.classList.remove('active'));
            tag.classList.add('active');

            // Update current filter
            currentFilter = tag.dataset.filter;

            // Filter features
            filterFeatures();

            // Scroll to top of features section
            const featuresMain = document.querySelector('.features-main');
            if (featuresMain) {
                featuresMain.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /**
     * Smooth scroll for source links (if opening in same tab)
     */
    document.querySelectorAll('.source-link').forEach(link => {
        link.addEventListener('mouseenter', function() {
            // Visual feedback on hover - already handled by CSS
        });
    });

    /**
     * Initialize - show all features on load
     */
    filterFeatures();
});
