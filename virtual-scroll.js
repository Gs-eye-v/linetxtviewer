class VirtualScroll {
    constructor(scrollContainer, listContainer, spacerContainer) {
        this.scrollContainer = scrollContainer;
        this.listContainer = listContainer;
        this.spacerContainer = spacerContainer;
        
        this.items = [];
        this.renderCallback = null;
        this.scrollCallback = null;
        
        // 1. 動的高さ管理用の配列を用意する
        this.heights = [];     // 各アイテムの高さ
        this.positions = [];   // 各アイテムの累積開始位置（Top座標）
        this.estimatedItemHeight = 75; // 初期の推定高さ
        this.overscan = 15;    
        
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
            this.updateVisibleItems(true);
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
        // 2. 初期値で positions を仮計算する
        this.heights = new Array(items.length).fill(this.estimatedItemHeight);
        this.positions = new Array(items.length + 1);
        
        let currentPos = 0;
        for (let i = 0; i < items.length; i++) {
            this.positions[i] = currentPos;
            currentPos += this.heights[i];
        }
        this.positions[items.length] = currentPos;
        
        this.spacerContainer.style.height = currentPos + 'px';
        
        // 初期表示時は最下部へスクロール
        this.scrollContainer.scrollTop = currentPos;
        this.scrollTop = currentPos;
        
        this.updateVisibleItems(true);
    }

    // 二分探索で現在のスクロール位置に対応するインデックスを取得
    binarySearch(scrollTop) {
        let low = 0;
        let high = this.positions.length - 1;
        while (low <= high) {
            let mid = Math.floor((low + high) / 2);
            if (this.positions[mid] <= scrollTop) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return high >= 0 ? high : 0;
    }

    updateVisibleItems(force = false) {
        if (!this.items.length) {
            this.listContainer.innerHTML = '';
            return;
        }

        const containerHeight = this.scrollContainer.clientHeight;
        
        // 3. positions を参照して開始インデックスを特定
        let start = this.binarySearch(this.scrollTop) - this.overscan;
        if (start < 0) start = 0;
        
        // 終了インデックスの特定（画面高さを超えるまで走査）
        let end = start;
        let visibleHeight = 0;
        while (end < this.items.length && visibleHeight < containerHeight + (this.overscan * this.estimatedItemHeight)) {
            visibleHeight += this.heights[end];
            end++;
        }
        // さらにバッファ分追加
        end = Math.min(this.items.length, end + this.overscan);

        if (force || start !== this.startIndex || end !== this.endIndex) {
            this.startIndex = start;
            this.endIndex = end;
            this.render();
        }

        if (this.scrollCallback) {
            const actualVisibleIndex = this.binarySearch(this.scrollTop);
            this.scrollCallback(actualVisibleIndex);
        }
    }

    render() {
        this.listContainer.innerHTML = '';
        
        // positions に基づく正確なオフセット指定
        const offsetTop = this.positions[this.startIndex] || 0;
        this.listContainer.style.transform = `translateY(${offsetTop}px)`;
        
        const fragment = document.createDocumentFragment();
        for (let i = this.startIndex; i < this.endIndex; i++) {
            if (this.renderCallback) {
                const el = this.renderCallback(this.items[i], i);
                if (el) fragment.appendChild(el);
            }
        }
        this.listContainer.appendChild(fragment);
        
        // 4. 描画直後に実際の高さを計測して positions を補正
        this.correctHeights();
    }

    correctHeights() {
        const children = this.listContainer.children;
        let changed = false;
        
        for (let i = 0; i < children.length; i++) {
            const itemIndex = this.startIndex + i;
            const actualHeight = children[i].offsetHeight;
            
            if (actualHeight > 0 && this.heights[itemIndex] !== actualHeight) {
                this.heights[itemIndex] = actualHeight;
                changed = true;
            }
        }
        
        if (changed) {
            // positions 配列の再計算
            let currentPos = 0;
            for (let i = 0; i < this.items.length; i++) {
                this.positions[i] = currentPos;
                currentPos += this.heights[i];
            }
            this.positions[this.items.length] = currentPos;
            
            // スペーサーとコンテナ位置の最終補正
            this.spacerContainer.style.height = currentPos + 'px';
            const correctedOffset = this.positions[this.startIndex] || 0;
            this.listContainer.style.transform = `translateY(${correctedOffset}px)`;
        }
    }

    scrollToIndex(index) {
        if (index < 0 || index >= this.items.length) return;
        
        // 5. positions を参照して正確な位置へスクロール
        let offsetTop = this.positions[index];
        offsetTop -= (this.scrollContainer.clientHeight / 2);
        if (offsetTop < 0) offsetTop = 0;
        
        this.scrollContainer.scrollTop = offsetTop;
        this.scrollTop = offsetTop;
        
        // 強制更新
        setTimeout(() => this.updateVisibleItems(true), 10);
    }

    getMiddleVisibleIndex() {
        if (!this.items.length) return 0;
        const middleScroll = this.scrollTop + (this.scrollContainer.clientHeight / 2);
        return this.binarySearch(middleScroll);
    }
}
