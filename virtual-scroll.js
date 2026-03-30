class VirtualScroll {
    constructor(scrollContainer, listContainer, spacerContainer) {
        this.scrollContainer = scrollContainer;
        this.listContainer = listContainer;
        this.spacerContainer = spacerContainer;
        
        this.items = [];
        this.renderCallback = null;
        this.scrollCallback = null;
        this.itemHeight = 70; 
        this.overscan = 20; 
        this.visibleCount = 0;
        
        this.startIndex = -1;
        this.endIndex = -1;
        this.scrollTop = 0;
        this.ticking = false;
        
        this.scrollContainer.addEventListener('scroll', () => {
            this.scrollTop = this.scrollContainer.scrollTop;
            if (!this.ticking) {
                window.requestAnimationFrame(() => {
                    this.updateVisibleItems();
                    this.ticking = false;
                });
                this.ticking = true;
            }
        });

        window.addEventListener('resize', () => {
            this.updateVisibleItems();
        });
    }

    setRenderer(callback) {
        this.renderCallback = callback;
    }

    setScrollCallback(callback) {
        this.scrollCallback = callback;
    }

    setItems(items) {
        this.items = items;
        this.spacerContainer.style.height = (this.items.length * this.itemHeight) + 'px';
        this.scrollContainer.scrollTop = this.spacerContainer.offsetHeight;
        this.updateVisibleItems(true);
    }

    updateVisibleItems(force = false) {
        if (!this.items.length) {
            this.listContainer.innerHTML = '';
            return;
        }

        const containerHeight = this.scrollContainer.clientHeight;
        this.visibleCount = Math.ceil(containerHeight / this.itemHeight);
        
        let visualStart = Math.floor(this.scrollTop / this.itemHeight);
        let start = visualStart - this.overscan;
        if (start < 0) start = 0;
        
        let end = start + this.visibleCount + (this.overscan * 2);
        if (end > this.items.length) {
            end = this.items.length;
        }

        if (force || start !== this.startIndex || end !== this.endIndex) {
            this.startIndex = start;
            this.endIndex = end;
            this.render();
        }

        if (this.scrollCallback) {
            let actualVisibleIndex = Math.floor(this.scrollTop / this.itemHeight);
            if (actualVisibleIndex >= this.items.length) actualVisibleIndex = this.items.length - 1;
            this.scrollCallback(actualVisibleIndex);
        }
    }

    render() {
        this.listContainer.innerHTML = '';
        const offsetTop = this.startIndex * this.itemHeight;
        this.listContainer.style.transform = `translateY(${offsetTop}px)`;
        
        const fragment = document.createDocumentFragment();
        for (let i = this.startIndex; i < this.endIndex; i++) {
            if (this.renderCallback) {
                const el = this.renderCallback(this.items[i], i);
                if (el) fragment.appendChild(el);
            }
        }
        this.listContainer.appendChild(fragment);
    }

    scrollToIndex(index) {
        let offsetTop = index * this.itemHeight;
        offsetTop -= (this.scrollContainer.clientHeight / 2);
        if (offsetTop < 0) offsetTop = 0;
        
        this.scrollContainer.scrollTo({ top: offsetTop, behavior: 'smooth' });
        this.scrollTop = offsetTop;
        
        // Wait a tick for smooth scroll to initialize, then force render so items appear instantly
        setTimeout(() => this.updateVisibleItems(true), 10);
    }
}
