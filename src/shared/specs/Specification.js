/**
 * 🔍 Specification Pattern Implementation
 * Enables composable, declarative business rule validations.
 */
class Specification {
    /**
     * Returns true if candidate satisfies the specification
     * @param {Object} candidate 
     * @returns {boolean}
     */
    isSatisfiedBy(candidate) {
        throw new Error('Specification.isSatisfiedBy() must be implemented');
    }

    and(otherSpec) {
        return new AndSpecification(this, otherSpec);
    }

    or(otherSpec) {
        return new OrSpecification(this, otherSpec);
    }

    not() {
        return new NotSpecification(this);
    }
}

class AndSpecification extends Specification {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }

    isSatisfiedBy(candidate) {
        return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
    }
}

class OrSpecification extends Specification {
    constructor(left, right) {
        super();
        this.left = left;
        this.right = right;
    }

    isSatisfiedBy(candidate) {
        return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
    }
}

class NotSpecification extends Specification {
    constructor(spec) {
        super();
        this.spec = spec;
    }

    isSatisfiedBy(candidate) {
        return !this.spec.isSatisfiedBy(candidate);
    }
}

module.exports = {
    Specification,
    AndSpecification,
    OrSpecification,
    NotSpecification
};
