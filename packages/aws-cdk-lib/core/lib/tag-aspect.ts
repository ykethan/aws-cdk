import { Construct, IConstruct } from 'constructs';
import { Annotations } from './annotations';
import { IAspect, Aspects, AspectOptions } from './aspect';
import { UnscopedValidationError } from './errors';
import { mutatingAspectPrio32333 } from './private/aspect-prio';
import { ITaggable, ITaggableV2, TagManager } from './tag-manager';

/**
 * Properties for a tag
 */
export interface TagProps {
  /**
   * Whether the tag should be applied to instances in an AutoScalingGroup
   *
   * @default true
   */
  readonly applyToLaunchedInstances?: boolean;

  /**
   * An array of Resource Types that will not receive this tag
   *
   * An empty array will allow this tag to be applied to all resources. A
   * non-empty array will apply this tag only if the Resource type is not in
   * this array.
   * @default []
   */
  readonly excludeResourceTypes?: string[];

  /**
   * An array of Resource Types that will receive this tag
   *
   * An empty array will match any Resource. A non-empty array will apply this
   * tag only to Resource types that are included in this array.
   * @default []
   */
  readonly includeResourceTypes?: string[];

  /**
   * Priority of the tag operation
   *
   * Higher or equal priority tags will take precedence.
   *
   * Setting priority will enable the user to control tags when they need to not
   * follow the default precedence pattern of last applied and closest to the
   * construct in the tree.
   *
   * @default
   *
   * Default priorities:
   *
   * - 100 for `SetTag`
   * - 200 for `RemoveTag`
   * - 50 for tags added directly to CloudFormation resources
   *
   */
  readonly priority?: number;
}

/**
 * The common functionality for Tag and Remove Tag Aspects
 */
abstract class TagBase implements IAspect {
  /**
   * The string key for the tag
   */
  public readonly key: string;

  protected readonly props: TagProps;

  constructor(key: string, props: TagProps = {}) {
    this.key = key;
    this.props = props;
  }

  public visit(construct: IConstruct): void {
    if (TagManager.isTaggableV2(construct)) {
      this.applyTagV2(construct);
    } else if (TagManager.isTaggable(construct)) {
      this.applyTag(construct);
    }
  }

  protected abstract applyTag(resource: ITaggable): void;
  protected abstract applyTagV2(resource: ITaggableV2): void;
}

/**
 * The Tag Aspect will handle adding a tag to this node and cascading tags to children
 */
export class Tag extends TagBase {
  /**
   * DEPRECATED: add tags to the node of a construct and all its the taggable children
   *
   * @deprecated use `Tags.of(scope).add()`
   */
  public static add(scope: Construct, key: string, value: string, props: TagProps = {}) {
    Annotations.of(scope).addDeprecation('@aws-cdk/core.Tag.add(scope,k,v)', 'Use "Tags.of(scope).add(k,v)" instead');
    Tags.of(scope).add(key, value, props);
  }

  /**
   * DEPRECATED: remove tags to the node of a construct and all its the taggable children
   *
   * @deprecated use `Tags.of(scope).remove()`
   */
  public static remove(scope: Construct, key: string, props: TagProps = {}) {
    Annotations.of(scope).addDeprecation('@aws-cdk/core.Tag.remove(scope,k,v)', 'Use "Tags.of(scope).remove(k,v)" instead');
    Tags.of(scope).remove(key, props);
  }

  /**
   * The string value of the tag
   */
  public readonly value: string;

  private readonly defaultPriority = 100;

  constructor(key: string, value: string, props: TagProps = {}) {
    super(key, props);
    if (value === undefined) {
      throw new UnscopedValidationError('Tag must have a value');
    }
    this.value = value;
  }

  protected applyTag(resource: ITaggable) {
    this.applyManager(resource.tags);
  }

  protected applyTagV2(resource: ITaggableV2) {
    this.applyManager(resource.cdkTagManager);
  }

  private applyManager(mgr: TagManager) {
    if (mgr.applyTagAspectHere(this.props.includeResourceTypes, this.props.excludeResourceTypes)) {
      mgr.setTag(
        this.key,
        this.value,
        this.props.priority ?? this.defaultPriority,
        this.props.applyToLaunchedInstances !== false,
      );
    }
  }
}

/**
 * Manages AWS tags for all resources within a construct scope.
 */
export class Tags {
  /**
   * Returns the tags API for this scope.
   * @param scope The scope
   */
  public static of(scope: IConstruct): Tags {
    return new Tags(scope);
  }

  private constructor(private readonly scope: IConstruct) { }

  /**
   * add tags to the node of a construct and all its the taggable children
   */
  public add(key: string, value: string, props: TagProps = {}) {
    const tag = new Tag(key, value, props);
    const options: AspectOptions = { priority: mutatingAspectPrio32333(this.scope) };
    Aspects.of(this.scope).add(tag, options);
  }

  /**
   * remove tags to the node of a construct and all its the taggable children
   */
  public remove(key: string, props: TagProps = {}) {
    const removeTag = new RemoveTag(key, props);
    const options: AspectOptions = { priority: mutatingAspectPrio32333(this.scope) };
    Aspects.of(this.scope).add(removeTag, options);
  }
}

/**
 * The RemoveTag Aspect will handle removing tags from this node and children
 */
export class RemoveTag extends TagBase {
  private readonly defaultPriority = 200;

  constructor(key: string, props: TagProps = {}) {
    super(key, props);
  }

  protected applyTag(resource: ITaggable): void {
    this.applyManager(resource.tags);
  }

  protected applyTagV2(resource: ITaggableV2): void {
    this.applyManager(resource.cdkTagManager);
  }

  private applyManager(mgr: TagManager) {
    if (mgr.applyTagAspectHere(this.props.includeResourceTypes, this.props.excludeResourceTypes)) {
      mgr.removeTag(this.key, this.props.priority ?? this.defaultPriority);
    }
  }
}
