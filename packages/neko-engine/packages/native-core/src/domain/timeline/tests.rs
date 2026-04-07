use super::*;

#[test]
fn test_timeline_total_frames() {
    let timeline = Timeline {
        duration: 10.0,
        fps: 30.0,
        ..Default::default()
    };
    assert_eq!(timeline.total_frames(), 300);
}

#[test]
fn test_element_visibility() {
    let element = Element {
        id: "test".to_string(),
        name: String::new(),
        element_type: ElementType::Media(MediaElementData {
            src: "/path/to/video.mp4".to_string(),
            resource_id: None,
            audio: None,
            media_type: None,
            linked_audio_id: None,
            volume: 1.0,
        }),
        start_time: 5.0,
        duration: 10.0,
        trim_start: 0.0,
        trim_end: 0.0,
        transform: Transform::default(),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        effects: Vec::new(),
        muted: false,
        hidden: false,
        locked: false,
        speed: None,
        transition_in: None,
        transition_out: None,
        masks: Vec::new(),
        transition: None,
    };

    assert!(!element.is_visible_at(4.9));
    assert!(element.is_visible_at(5.0));
    assert!(element.is_visible_at(10.0));
    assert!(!element.is_visible_at(15.0));
}

#[test]
fn test_element_source_time() {
    let element = Element {
        id: "test".to_string(),
        name: String::new(),
        element_type: ElementType::Media(MediaElementData {
            src: "/path/to/video.mp4".to_string(),
            resource_id: None,
            audio: None,
            media_type: None,
            linked_audio_id: None,
            volume: 1.0,
        }),
        start_time: 5.0,
        duration: 10.0,
        trim_start: 2.0,
        trim_end: 0.0,
        transform: Transform::default(),
        opacity: 1.0,
        blend_mode: BlendMode::Normal,
        effects: Vec::new(),
        muted: false,
        hidden: false,
        locked: false,
        speed: None,
        transition_in: None,
        transition_out: None,
        masks: Vec::new(),
        transition: None,
    };

    assert_eq!(element.get_source_time(5.0), 2.0);
    assert_eq!(element.get_source_time(10.0), 7.0);
}
