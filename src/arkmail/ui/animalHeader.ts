/** Jeden stabilny przycisk zwierzecia w natywnym naglowku popupu. */
export interface AnimalHeaderControl {
  readonly element: HTMLButtonElement;
  update(wide: boolean, flying: boolean): void;
}

export function createAnimalHeader(onSend: () => void): AnimalHeaderControl {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'arkmail-animal-send popup-header-btn';
  element.addEventListener('click', onSend);

  return {
    element,
    update(wide: boolean, flying: boolean): void {
      const accessibleName = flying ? 'Zwierze w drodze...' : 'Wyslij zwierze';
      element.textContent = flying
        ? wide ? 'Zwierze w drodze...' : 'W drodze...'
        : wide ? 'Wyslij zwierze' : 'Zwierze';
      element.disabled = flying;
      element.title = accessibleName;
      element.setAttribute('aria-label', accessibleName);
    },
  };
}
